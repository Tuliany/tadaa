import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { renderToken } from "./auth";
import { getReel, listMedia, saveReel } from "./db";
import { toRenderProps } from "./props";
import { RENDER_DIR, renderPath } from "./storage";
import type { Brand, Reel } from "./types";

/** In-flight renders, shared by the web app and the Claude connector. */
const g = globalThis as unknown as {
  __tadaaRenders?: Map<string, Promise<string>>;
  __tadaaRenderErrors?: Map<string, string>;
  __tadaaRenderProgress?: Map<string, number>;
};
const running = (g.__tadaaRenders ??= new Map());
const failures = (g.__tadaaRenderErrors ??= new Map());
const progress = (g.__tadaaRenderProgress ??= new Map());

/** 0–100 while a render is running (the browser loading counts as the first few percent). */
export function renderProgress(reelId: string) {
  return progress.get(reelId) ?? 0;
}

function runRender(propsFile: string, outFile: string, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/render.mjs"), propsFile, outFile], {
      cwd: process.cwd(),
      env: process.env,
    });
    let log = "";
    child.stdout.on("data", (d) => {
      log += d;
      const all = [...String(d).matchAll(/progress (\d+)%/g)];
      if (all.length) onProgress?.(Number(all[all.length - 1][1]));
    });
    child.stderr.on("data", (d) => (log += d));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      console.error(`[render] failed with code ${code}\n${log}`);
      const lines = log.split("\n").filter(Boolean);
      const reason = lines.find((l) => /^(\w*Error|Error)[:\s]/.test(l.trim())) ?? lines.at(-1) ?? `exit code ${code}`;
      reject(new Error(reason.trim().slice(0, 300)));
    });
  });
}

/** True if the Reel already has an MP4 on disk. */
export async function hasRender(reel: Reel) {
  if (!reel.renderFile) return false;
  try {
    await fs.access(renderPath(reel.renderFile));
    return true;
  } catch {
    return false;
  }
}

export function renderState(reelId: string): "rendering" | "failed" | "idle" {
  if (running.has(reelId)) return "rendering";
  if (failures.has(reelId)) return "failed";
  return "idle";
}

export function renderError(reelId: string) {
  return failures.get(reelId);
}

/** Start (or join) the MP4 render for a Reel. Resolves with the file name. */
export function startRender(brand: Brand, reel: Reel): Promise<string> {
  const id = reel.id;
  let job = running.get(id);
  if (job) return job;
  failures.delete(id);
  job = (async () => {
    const media = await listMedia(brand.id);
    // The renderer runs in this container, so load media over loopback rather than the public URL.
    const origin = process.env.TADAA_RENDER_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const props = toRenderProps(brand, reel, media, origin);
    // The renderer has no login cookie; give it this process's render token for our own media URLs.
    const withToken = (u?: string) => (u && u.startsWith(`${origin}/api/media/`) ? `${u}?rt=${renderToken()}` : u);
    props.media = props.media.map((m) => ({ ...m, url: withToken(m.url)! }));
    props.brand = { ...props.brand, logoUrl: withToken(props.brand.logoUrl) };
    await fs.mkdir(RENDER_DIR, { recursive: true });
    const propsFile = path.join(os.tmpdir(), `tadaa-${id}-${Date.now()}.json`);
    await fs.writeFile(propsFile, JSON.stringify(props));
    const fileName = `${id}-${Date.now()}.mp4`;
    try {
      progress.set(id, 0);
      await runRender(propsFile, renderPath(fileName), (pct) => progress.set(id, pct));
    } finally {
      fs.unlink(propsFile).catch(() => {});
    }
    const latest = await getReel(id);
    if (latest) await saveReel({ ...latest, renderFile: fileName });
    return fileName;
  })();
  job
    .catch((e: Error) => failures.set(id, e.message))
    .finally(() => {
      running.delete(id);
      progress.delete(id);
    });
  running.set(id, job);
  return job;
}
