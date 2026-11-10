import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { getBrand, getReel } from "@/lib/db";
import { renderPath } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/reels/[id]/download">) {
  const { id } = await ctx.params;
  const reel = await getReel(id);
  if (!reel?.renderFile) return new Response("Not rendered yet", { status: 404 });
  const file = renderPath(reel.renderFile);
  const { size } = await fs.stat(file);
  const brand = await getBrand(reel.brandId);
  const slug = `${brand?.name ?? "reel"}-${reel.topic}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "content-type": "video/mp4",
      "content-length": String(size),
      "content-disposition": `attachment; filename="${slug}.mp4"`,
    },
  });
}
