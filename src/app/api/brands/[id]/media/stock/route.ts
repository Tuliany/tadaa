import { z } from "zod";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { importMedia, MAX_MEDIA_BYTES } from "@/lib/media";
import { videoForImport } from "@/lib/pexels";

export const maxDuration = 120;

/** Copies a Pexels clip into the brand's library (with attribution). */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/media/stock">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const body = z.object({ id: z.number().int().positive() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Pick a clip.");
  let v;
  try {
    v = await videoForImport(body.data.id);
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
  if (!/^https:\/\/([a-z0-9-]+\.)*pexels\.com\//.test(v.link)) throw new HttpError(502, "Unexpected file location from Pexels.");
  const res = await fetch(v.link);
  if (!res.ok) throw new HttpError(502, `Couldn't download the clip (${res.status}).`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_MEDIA_BYTES) throw new HttpError(413, "That clip is too large.");
  const item = await importMedia(brand.id, `pexels-${body.data.id}.mp4`, "video/mp4", data, { name: "Pexels", url: v.pageUrl, author: v.author });
  if (!item) throw new HttpError(500, "Couldn't save the clip.");
  return Response.json(item);
});
