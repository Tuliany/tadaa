import { z } from "zod";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { getConnection, getReel, saveReel } from "@/lib/db";
import { publishFacebookReel, selectedPage, startInstagramReel } from "@/lib/meta";
import { hasRender, startRender } from "@/lib/render";
import { renderPath } from "@/lib/storage";
import type { Publication, Reel } from "@/lib/types";

export const maxDuration = 300;

const body = z.object({
  caption: z.string().max(2200),
  instagram: z.boolean(),
  facebook: z.boolean(),
  shareToFeed: z.boolean(),
});

/** Post the approved Reel to the brand's Instagram and/or Facebook Page. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/meta">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Please check the post settings.");
  const s = parsed.data;
  if (!s.instagram && !s.facebook) throw new HttpError(400, "Choose Instagram, Facebook or both.");
  if (reel.status !== "approved") throw new HttpError(400, "Approve the Reel before posting it.");
  if ((s.caption.match(/#/g) ?? []).length > 30) throw new HttpError(400, "Instagram allows at most 30 hashtags.");

  const conn = await getConnection(brand.id, "meta");
  if (!conn) throw new HttpError(400, "Connect Facebook first (Accounts → Facebook).");
  const page = selectedPage(conn);
  if (s.instagram && !page.igId) throw new HttpError(400, `The Page "${page.name}" has no Instagram professional account linked.`);

  let current: Reel = reel;
  if (!(await hasRender(reel))) {
    try {
      await startRender(brand, reel);
    } catch (e) {
      console.error("[meta] render before posting failed", e);
      throw new HttpError(500, "The video couldn't be created, so nothing was posted. Please try again in a minute.");
    }
    current = (await getReel(reel.id)) ?? reel;
  }
  const file = renderPath(current.renderFile!);
  const now = new Date().toISOString();
  const pubs: Publication[] = [];
  const errors: string[] = [];

  if (s.instagram) {
    try {
      const id = await startInstagramReel(page, file, s.caption, s.shareToFeed);
      pubs.push({ provider: "instagram", accountName: page.igUsername ? `@${page.igUsername}` : page.name, publishId: id, privacy: "PUBLIC", status: "processing", createdAt: now, updatedAt: now });
    } catch (e) {
      errors.push(`Instagram: ${(e as Error).message}`);
    }
  }
  if (s.facebook) {
    try {
      const id = await publishFacebookReel(page, file, s.caption);
      pubs.push({ provider: "facebook", accountName: page.name, publishId: id, privacy: "PUBLIC", status: "processing", createdAt: now, updatedAt: now });
    } catch (e) {
      errors.push(`Facebook: ${(e as Error).message}`);
    }
  }
  if (!pubs.length) throw new HttpError(400, errors.join(" "));
  const latest = (await getReel(reel.id)) ?? current;
  const saved = await saveReel({ ...latest, publications: [...(latest.publications ?? []), ...pubs], updatedAt: now });
  return Response.json({ reel: saved, errors });
});
