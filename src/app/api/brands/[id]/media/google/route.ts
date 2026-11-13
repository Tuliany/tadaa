import { z } from "zod";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { importMedia, MAX_MEDIA_BYTES, mediaKind } from "@/lib/media";
import type { MediaItem } from "@/lib/types";

export const maxDuration = 300;

const body = z.object({
  accessToken: z.string().min(10),
  files: z.array(z.object({ id: z.string().regex(/^[\w-]+$/), name: z.string().max(300), mimeType: z.string().max(100) })).min(1).max(50),
});

/**
 * Imports files the user picked in the Google Drive picker into the brand's library.
 * The short-lived token (scope drive.file) only reaches files the user picked; it's used once and never stored.
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/media/google">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Pick up to 50 photos or clips.");
  const { accessToken, files } = parsed.data;

  const saved: MediaItem[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (!mediaKind(f.mimeType)) {
      skipped.push(f.name);
      continue;
    }
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) throw new HttpError(400, "Google sign-in expired. Please pick the files again.");
    if (!res.ok) {
      skipped.push(f.name);
      continue;
    }
    const size = Number(res.headers.get("content-length") || 0);
    if (size > MAX_MEDIA_BYTES) {
      skipped.push(`${f.name} (larger than 200 MB)`);
      continue;
    }
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_MEDIA_BYTES) {
      skipped.push(`${f.name} (larger than 200 MB)`);
      continue;
    }
    const item = await importMedia(brand.id, f.name, res.headers.get("content-type")?.split(";")[0] || f.mimeType, data);
    if (item) saved.push({ ...item, fileName: f.name });
    else skipped.push(f.name);
  }
  if (!saved.length) throw new HttpError(400, "None of the picked files could be imported – only photos and videos work.");
  return Response.json({ items: saved, skipped });
});
