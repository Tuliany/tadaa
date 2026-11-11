import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { handle, HttpError, renderToken, requireReel } from "@/lib/auth";
import { getReel, listMedia, saveReel } from "@/lib/db";
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
      const lines = log.split("\n").filter(Boolean);
      const reason = lines.find((l) => /^(\w*Error|Error)[:\s]/.test(l.trim())) ?? lines.at(-1) ?? `exit code ${code}`;
      reject(new Error(reason.trim().slice(0, 300)));
    });
  });
}

/** Renders the Reel to MP4 (or returns the cached render) and responds with its download URL. */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/render">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const id = reel.id;

  if (reel.renderFile) {
    try {
      await fs.access(renderPath(reel.renderFile));
      return Response.json({ url: `/api/reels/${id}/download` });
    } catch {
      /* file gone – render again */
    }
  }


  let job = running.get(id);
  if (!job) {
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
    throw new HttpError(500, `The video couldn't be created. Please try again in a minute. (${(e as Error).message})`);
  }
});
