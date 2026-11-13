import { z } from "zod";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { getConnection, getReel, saveReel } from "@/lib/db";
import { selectedAccount } from "@/lib/instagram";
import { publishFacebookReel, selectedPage, startInstagramReel } from "@/lib/meta";
import { hasRender, startRender } from "@/lib/render";
import { localFile } from "@/lib/storage";
import type { MetaPage, Publication, Reel, SocialProvider } from "@/lib/types";

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

  const [conn, igConn] = await Promise.all([getConnection(brand.id, "meta"), getConnection(brand.id, "instagram")]);
  const page = conn ? selectedPage(conn) : null;
  if (s.facebook && !page) throw new HttpError(400, "Connect Facebook first (Accounts → Facebook).");
  // Instagram: the directly connected account wins; otherwise the Instagram linked to the Facebook Page.
  let ig: { acc: MetaPage; via: SocialProvider } | null = null;
  if (igConn) ig = { acc: selectedAccount(igConn), via: "instagram" };
  else if (page?.igId) ig = { acc: page, via: "meta" };
  if (s.instagram && !ig) throw new HttpError(400, "Connect Instagram first (Accounts → Instagram).");

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
  const file = await localFile("renders", current.renderFile!);
  const now = new Date().toISOString();
  const pubs: Publication[] = [];
  const errors: string[] = [];

  if (s.instagram) {
    try {
      const id = await startInstagramReel(ig!.acc, file, s.caption, s.shareToFeed);
      pubs.push({
        provider: "instagram",
        accountName: ig!.acc.igUsername ? `@${ig!.acc.igUsername}` : ig!.acc.name,
        publishId: id,
        privacy: "PUBLIC",
        status: "processing",
        via: ig!.via,
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      errors.push(`Instagram: ${(e as Error).message}`);
    }
  }
  if (s.facebook) {
    try {
      const id = await publishFacebookReel(page!, file, s.caption);
      pubs.push({ provider: "facebook", accountName: page!.name, publishId: id, privacy: "PUBLIC", status: "processing", createdAt: now, updatedAt: now });
    } catch (e) {
      errors.push(`Facebook: ${(e as Error).message}`);
    }
  }
  if (!pubs.length) throw new HttpError(400, errors.join(" "));
  const latest = (await getReel(reel.id)) ?? current;
  const saved = await saveReel({ ...latest, publications: [...(latest.publications ?? []), ...pubs], updatedAt: now });
  return Response.json({ reel: saved, errors });
});
