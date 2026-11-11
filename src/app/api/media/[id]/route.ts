import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { canReadMedia } from "@/lib/auth";
import { uploadPath } from "@/lib/storage";

/** Serves uploaded media with HTTP range support so videos can seek. */
export async function GET(req: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const item = await canReadMedia(id, new URL(req.url).searchParams.get("rt"));
  if (!item) return new Response("Not found", { status: 404 });

  const file = uploadPath(item.fileName);
  const { size } = await fs.stat(file);
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
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
}
