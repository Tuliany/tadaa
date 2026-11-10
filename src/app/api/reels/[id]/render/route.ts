import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { getBrand, getReel, listMedia, saveReel } from "@/lib/db";
import { toRenderProps } from "@/lib/props";
import { RENDER_DIR, renderPath } from "@/lib/storage";

export const maxDuration = 300;

const running = new Map<string, Promise<string>>();

function runRender(propsFile: string, outFile: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/render.mjs"), propsFile, outFile], {
      cwd: process.cwd(),
      env: process.env,
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      console.error(`[render] failed with code ${code}\n${log}`);
      reject(new Error(log.split("\n").filter(Boolean).slice(-15).join("\n")));
    });
  });
}

/** Renders the Reel to MP4 (or returns the cached render) and responds with its download URL. */
export async function POST(req: Request, ctx: RouteContext<"/api/reels/[id]/render">) {
  const { id } = await ctx.params;
  const reel = await getReel(id);
  if (!reel) return Response.json({ error: "Not found" }, { status: 404 });

  if (reel.renderFile) {
    try {
      await fs.access(renderPath(reel.renderFile));
      return Response.json({ url: `/api/reels/${id}/download` });
    } catch {
      /* file gone – render again */
    }
  }

  const brand = await getBrand(reel.brandId);
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  let job = running.get(id);
  if (!job) {
    job = (async () => {
      const media = await listMedia(brand.id);
      const origin = process.env.TADAA_RENDER_ORIGIN || new URL(req.url).origin;
      const props = toRenderProps(brand, reel, media, origin);
      await fs.mkdir(RENDER_DIR, { recursive: true });
      const propsFile = path.join(os.tmpdir(), `tadaa-${id}-${Date.now()}.json`);
      await fs.writeFile(propsFile, JSON.stringify(props));
      const fileName = `${id}-${Date.now()}.mp4`;
      try {
        await runRender(propsFile, renderPath(fileName));
      } finally {
        fs.unlink(propsFile).catch(() => {});
      }
      const latest = await getReel(id);
      if (latest) await saveReel({ ...latest, renderFile: fileName });
      return fileName;
    })().finally(() => running.delete(id));
    running.set(id, job);
  }

  try {
    await job;
    return Response.json({ url: `/api/reels/${id}/download` });
  } catch (e) {
    return Response.json({ error: `Render failed: ${(e as Error).message}` }, { status: 500 });
  }
}
