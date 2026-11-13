import { handle, HttpError, requireBrand } from "@/lib/auth";
import { listMedia } from "@/lib/db";
import { importMedia, MAX_MEDIA_BYTES, mediaKind } from "@/lib/media";
import type { MediaItem } from "@/lib/types";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/media">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(await listMedia(brand.id));
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/media">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const id = brand.id;

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "No files uploaded");

  const saved: MediaItem[] = [];
  for (const file of files) {
    if (!mediaKind(file.type)) continue;
    if (file.size > MAX_MEDIA_BYTES) throw new HttpError(413, `${file.name} is larger than 200 MB`);
    const item = await importMedia(id, file.name, file.type, Buffer.from(await file.arrayBuffer()));
    if (item) saved.push({ ...item, fileName: file.name });
  }
  if (!saved.length) throw new HttpError(400, "Only photos and videos are supported");
  return Response.json(saved);
});
