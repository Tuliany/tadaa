import { z } from "zod";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { getConnection, getReel, saveReel } from "@/lib/db";
import { hasRender, startRender } from "@/lib/render";
import { localFile } from "@/lib/storage";
import { reelDuration, FPS } from "@/lib/templates";
import { accessToken, creatorInfo, publishVideo } from "@/lib/tiktok";
import type { Publication, Reel } from "@/lib/types";

export const maxDuration = 300;

async function connectionFor(brandId: string) {
  const conn = await getConnection(brandId, "tiktok");
  if (!conn) throw new HttpError(400, "Connect a TikTok account first (Accounts → TikTok).");
  return conn;
}

/** Fresh creator info for the "Post to TikTok" screen (TikTok requires it every time the screen opens). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/tiktok">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const conn = await connectionFor(brand.id);
  const info = await creatorInfo(await accessToken(conn));
  const seconds = Math.ceil(reelDuration(reel.script) / FPS);
  return Response.json({ creator: info, videoSeconds: seconds, tooLong: seconds > info.max_video_post_duration_sec });
});

const body = z.object({
  title: z.string().max(2200),
  privacyLevel: z.string().min(1),
  allowComment: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  disclose: z.boolean(),
  yourBrand: z.boolean(),
  brandedContent: z.boolean(),
  consent: z.literal(true),
});

/** Post the Reel to the brand's TikTok (Direct Post). Renders the MP4 first if needed. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/tiktok">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "Please fill in the post settings.");
  const s = parsed.data;
  if (reel.status !== "approved") throw new HttpError(400, "Approve the Reel before posting it.");
  if (s.disclose && !s.yourBrand && !s.brandedContent) throw new HttpError(400, "Choose \"Your brand\" or \"Branded content\", or turn off the disclosure.");
  if (s.brandedContent && s.privacyLevel === "SELF_ONLY") throw new HttpError(400, "Branded content visibility cannot be set to private.");

  const conn = await connectionFor(brand.id);
  const token = await accessToken(conn);
  // TikTok requires the latest creator info at posting time.
  const info = await creatorInfo(token);
  if (!info.privacy_level_options.includes(s.privacyLevel)) throw new HttpError(400, "That privacy setting isn't available for this account.");
  if (Math.ceil(reelDuration(reel.script) / FPS) > info.max_video_post_duration_sec) throw new HttpError(400, "This video is longer than TikTok allows for this account.");

  let current: Reel = reel;
  if (!(await hasRender(reel))) {
    try {
      await startRender(brand, reel);
    } catch (e) {
      console.error("[tiktok] render before posting failed", e);
      throw new HttpError(500, "The video couldn't be created, so nothing was posted. Please try again in a minute.");
    }
    current = (await getReel(reel.id)) ?? reel;
  }

  const publishId = await publishVideo(token, await localFile("renders", current.renderFile!), {
    title: s.title,
    privacyLevel: s.privacyLevel,
    allowComment: s.allowComment && !info.comment_disabled,
    allowDuet: s.allowDuet && !info.duet_disabled,
    allowStitch: s.allowStitch && !info.stitch_disabled,
    yourBrand: s.disclose && s.yourBrand,
    brandedContent: s.disclose && s.brandedContent,
  });

  const now = new Date().toISOString();
  const pub: Publication = {
    provider: "tiktok",
    accountName: info.creator_nickname || conn.displayName,
    publishId,
    privacy: s.privacyLevel,
    status: "processing",
    createdAt: now,
    updatedAt: now,
  };
  const latest = (await getReel(reel.id)) ?? current;
  const saved = await saveReel({ ...latest, publications: [...(latest.publications ?? []), pub], updatedAt: now });
  return Response.json(saved);
});
