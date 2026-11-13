import { handle, requireReel } from "@/lib/auth";
import { getConnection, getReel, saveReel } from "@/lib/db";
import { accessToken as liToken, videoStatus } from "@/lib/linkedin";
import { advanceInstagramReel, facebookReelStatus } from "@/lib/meta";
import { accessToken, publishStatus } from "@/lib/tiktok";
import type { Publication } from "@/lib/types";

/** Checks every platform for posts still processing (and publishes Instagram Reels once they're ready). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/publications">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const pending = (reel.publications ?? []).filter((p) => p.status === "processing");
  if (!pending.length) return Response.json(reel);

  const [tt, meta, ig, li] = await Promise.all([
    getConnection(brand.id, "tiktok"),
    getConnection(brand.id, "meta"),
    getConnection(brand.id, "instagram"),
    getConnection(brand.id, "linkedin"),
  ]);
  const page = meta?.pages?.find((p) => p.id === meta.selectedPageId);
  // Instagram posts are checked with the connection that started them.
  const igFor = (via?: string) => {
    const conn = via === "instagram" ? ig : via === "meta" ? meta : (ig ?? meta);
    return conn?.pages?.find((p) => p.id === conn.selectedPageId && p.igId);
  };
  const updates = new Map<string, Partial<Publication>>();

  for (const p of pending) {
    try {
      if (p.provider === "tiktok" && tt) {
        const st = await publishStatus(await accessToken(tt), p.publishId);
        if (st.status === "PUBLISH_COMPLETE" || st.status === "SEND_TO_USER_INBOX") {
          updates.set(p.publishId, { status: "published", postId: st.publicaly_available_post_id?.[0]?.toString() });
        } else if (st.status === "FAILED") updates.set(p.publishId, { status: "failed", error: st.fail_reason || "TikTok couldn't publish the video." });
      } else if (p.provider === "instagram" && igFor(p.via)) {
        const r = await advanceInstagramReel(igFor(p.via)!, p.publishId);
        if (r.state === "published") updates.set(p.publishId, { status: "published", postId: r.postId, permalink: r.permalink });
        else if (r.state === "failed") updates.set(p.publishId, { status: "failed", error: r.error });
      } else if (p.provider === "linkedin" && li) {
        const r = await videoStatus(await liToken(li), p.publishId);
        if (r.state === "published") updates.set(p.publishId, { status: "published" });
        else if (r.state === "failed") updates.set(p.publishId, { status: "failed", error: r.error });
      } else if (p.provider === "facebook" && page) {
        const r = await facebookReelStatus(page, p.publishId);
        if (r.state === "published") updates.set(p.publishId, { status: "published", permalink: r.permalink });
        else if (r.state === "failed") updates.set(p.publishId, { status: "failed", error: r.error });
      }
    } catch (e) {
      // Keep it processing; a transient error shouldn't fail the post. Give up after an hour.
      if (Date.now() - Date.parse(p.createdAt) > 3600_000) updates.set(p.publishId, { status: "failed", error: (e as Error).message });
    }
  }
  if (!updates.size) return Response.json(reel);
  const latest = (await getReel(reel.id)) ?? reel;
  const now = new Date().toISOString();
  const saved = await saveReel({
    ...latest,
    publications: (latest.publications ?? []).map((p) => (updates.has(p.publishId) ? { ...p, ...updates.get(p.publishId), updatedAt: now } : p)),
  });
  return Response.json(saved);
});
