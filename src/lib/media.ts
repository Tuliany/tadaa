import { nanoid } from "nanoid";
import path from "path";
import sharp from "sharp";
import { saveMedia } from "./db";
import { probeDuration } from "./reference";
import { localFile, saveFile } from "./storage";
import type { MediaItem } from "./types";

export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export function mediaKind(mimeType: string) {
  return mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : null;
}

/** Stores one photo or clip in the brand's library (photos shrunk to Reel size). */
export async function importMedia(
  brandId: string,
  name: string,
  mime: string,
  input: Buffer,
  source?: MediaItem["source"],
): Promise<MediaItem | null> {
  const kind = mediaKind(mime);
  if (!kind) return null;
  const mediaId = nanoid(12);
  let data = input;
  let ext = path.extname(name).toLowerCase() || (kind === "video" ? ".mp4" : ".jpg");
  let mimeType = mime;
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
  await saveFile("uploads", fileName, data);
  const duration = kind === "video" ? await probeDuration(await localFile("uploads", fileName)) : undefined;
  const item: MediaItem = { id: mediaId, brandId, fileName, mimeType, kind, ...(duration ? { duration } : {}), ...(source ? { source } : {}), createdAt: new Date().toISOString() };
  await saveMedia(item);
  return item;
}
