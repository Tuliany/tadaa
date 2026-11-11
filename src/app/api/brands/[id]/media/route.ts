import { nanoid } from "nanoid";
import sharp from "sharp";
import path from "path";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { listMedia, saveMedia } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import type { MediaItem } from "@/lib/types";

const MAX_BYTES = 200 * 1024 * 1024;

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
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) continue;
    if (file.size > MAX_BYTES) {
      throw new HttpError(413, `${file.name} is larger than 200 MB`);
    }
    const mediaId = nanoid(12);
    let data: Buffer = Buffer.from(await file.arrayBuffer());
    let ext = path.extname(file.name).toLowerCase() || (kind === "video" ? ".mp4" : ".jpg");
    let mimeType = file.type;
    if (kind === "image") {
      // Phone photos can be 12+ MP; shrink to Reel size so previews are fast and renders don't run out of memory.
      try {
        const img = sharp(data, { failOn: "none" }).rotate();
        const meta = await img.metadata();
        const keepAlpha = meta.hasAlpha && meta.format === "png";
        data = await img
          .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
          [keepAlpha ? "png" : "jpeg"](keepAlpha ? {} : { quality: 85, mozjpeg: true })
          .toBuffer();
        ext = keepAlpha ? ".png" : ".jpg";
        mimeType = keepAlpha ? "image/png" : "image/jpeg";
      } catch {
        /* unsupported format (e.g. some HEIC files) – keep the original */
      }
    }
    const fileName = `${mediaId}${ext}`;
    await saveUpload(fileName, data);
    const item: MediaItem = {
      id: mediaId,
      brandId: id,
      fileName,
      mimeType,
      kind,
      createdAt: new Date().toISOString(),
    };
    await saveMedia(item);
    saved.push({ ...item, fileName: file.name });
  }
  if (!saved.length) throw new HttpError(400, "Only photos and videos are supported");
  return Response.json(saved);
});
