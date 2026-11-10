import { nanoid } from "nanoid";
import path from "path";
import { getBrand, listMedia, saveMedia } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import type { MediaItem } from "@/lib/types";

const MAX_BYTES = 200 * 1024 * 1024;

export async function GET(_req: Request, ctx: RouteContext<"/api/brands/[id]/media">) {
  const { id } = await ctx.params;
  return Response.json(await listMedia(id));
}

export async function POST(req: Request, ctx: RouteContext<"/api/brands/[id]/media">) {
  const { id } = await ctx.params;
  if (!(await getBrand(id))) return Response.json({ error: "Brand not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "No files uploaded" }, { status: 400 });

  const saved: MediaItem[] = [];
  for (const file of files) {
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) continue;
    if (file.size > MAX_BYTES) {
      return Response.json({ error: `${file.name} is larger than 200 MB` }, { status: 413 });
    }
    const mediaId = nanoid(12);
    const ext = path.extname(file.name).toLowerCase() || (kind === "video" ? ".mp4" : ".jpg");
    const fileName = `${mediaId}${ext}`;
    await saveUpload(fileName, Buffer.from(await file.arrayBuffer()));
    const item: MediaItem = {
      id: mediaId,
      brandId: id,
      fileName,
      mimeType: file.type,
      kind,
      createdAt: new Date().toISOString(),
    };
    await saveMedia(item);
    saved.push({ ...item, fileName: file.name });
  }
  if (!saved.length) return Response.json({ error: "Only photos and videos are supported" }, { status: 400 });
  return Response.json(saved);
}
