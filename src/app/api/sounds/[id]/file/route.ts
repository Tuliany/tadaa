import { getStoredSound } from "@/lib/sounds";
import { fileSize, openFile } from "@/lib/storage";

/** Serves an imported sound (CC0, so no login needed; the renderer fetches it too). Supports ranges. */
export async function GET(req: Request, ctx: RouteContext<"/api/sounds/[id]/file">) {
  const sound = await getStoredSound((await ctx.params).id);
  if (!sound) return new Response("Not found", { status: 404 });
  const size = await fileSize("uploads", sound.fileName);
  if (size === null) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = { "content-type": sound.mimeType, "accept-ranges": "bytes", "cache-control": "public, max-age=86400" };
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = await openFile("uploads", sound.fileName, { start, end });
    if (!stream) return new Response("Not found", { status: 404 });
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  const stream = await openFile("uploads", sound.fileName);
  if (!stream) return new Response("Not found", { status: 404 });
  return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
}
