import { z } from "zod";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { importMedia, MAX_MEDIA_BYTES } from "@/lib/media";
import { stockForImport } from "@/lib/stock";

export const maxDuration = 120;

/** Copies a stock clip into the brand's library (with attribution). */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/media/stock">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const body = z.object({ id: z.string().regex(/^(pixabay|pexels):\d+$/) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Pick a clip.");
  let v;
  try {
    v = await stockForImport(body.data.id);
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
  const res = await fetch(v.link);
  if (!res.ok) throw new HttpError(502, `Couldn't download the clip (${res.status}).`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_MEDIA_BYTES) throw new HttpError(413, "That clip is too large.");
  const name = `${body.data.id.replace(":", "-")}.mp4`;
  const item = await importMedia(brand.id, name, "video/mp4", data, { name: v.source, url: v.pageUrl, author: v.author });
  if (!item) throw new HttpError(500, "Couldn't save the clip.");
  return Response.json(item);
});
