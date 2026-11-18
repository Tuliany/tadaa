import { currentUser, renderToken } from "@/lib/auth";
import { getBrand } from "@/lib/db";
import { fileSize, openFile } from "@/lib/storage";
import { getVoice } from "@/lib/voice";

/** Serves a voice recording / AI voice: to the brand's owner, or the renderer (render token). Supports ranges. */
export async function GET(req: Request, ctx: RouteContext<"/api/voices/[id]/file">) {
  const v = await getVoice((await ctx.params).id);
  if (!v?.fileName) return new Response("Not found", { status: 404 });
  const rt = new URL(req.url).searchParams.get("rt");
  if (!(rt && rt === renderToken())) {
    const user = await currentUser();
    const brand = user ? await getBrand(v.brandId) : null;
    if (!user || brand?.ownerId !== user.id) return new Response("Not found", { status: 404 });
  }
  const size = await fileSize("uploads", v.fileName);
  if (size === null) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = { "content-type": v.mimeType ?? "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = await openFile("uploads", v.fileName, { start, end });
    if (!stream) return new Response("Not found", { status: 404 });
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  const stream = await openFile("uploads", v.fileName);
  if (!stream) return new Response("Not found", { status: 404 });
  return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
}
