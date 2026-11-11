import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { handle, requireReel } from "@/lib/auth";
import { getBrand, getReel } from "@/lib/db";
import { verifyDownload } from "@/lib/oauth";
import { renderPath } from "@/lib/storage";

/** Download the MP4. Works with a login cookie, or with a signed link (from the Claude connector). */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/download">) => {
  const id = (await ctx.params).id;
  const q = new URL(req.url).searchParams;
  let reel, brand;
  if (await verifyDownload(id, q.get("exp"), q.get("sig"))) {
    reel = await getReel(id);
    brand = reel ? await getBrand(reel.brandId) : null;
    if (!reel || !brand) return new Response("Not found", { status: 404 });
  } else {
    ({ reel, brand } = await requireReel(id));
  }
  if (!reel.renderFile) return new Response("Not rendered yet", { status: 404 });
  const file = renderPath(reel.renderFile);
  const { size } = await fs.stat(file);
  const slug = `${brand.name}-${reel.topic}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "content-type": "video/mp4",
      "content-length": String(size),
      "content-disposition": `attachment; filename="${slug}.mp4"`,
    },
  });
});
