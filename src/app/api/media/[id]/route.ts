import { canReadMedia } from "@/lib/auth";
import { fileSize, openFile } from "@/lib/storage";

/** Serves uploaded media with HTTP range support so videos can seek. */
export async function GET(req: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const item = await canReadMedia(id, new URL(req.url).searchParams.get("rt"));
  if (!item) return new Response("Not found", { status: 404 });

  const size = await fileSize("uploads", item.fileName);
  if (size === null) return new Response("Not found", { status: 404 });
  const range = req.headers.get("range");
  const headers: Record<string, string> = {
    "content-type": item.mimeType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
  };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? parseInt(m[1], 10) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    const stream = await openFile("uploads", item.fileName, { start, end });
    if (!stream) return new Response("Not found", { status: 404 });
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }

  const stream = await openFile("uploads", item.fileName);
  if (!stream) return new Response("Not found", { status: 404 });
  return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
}
