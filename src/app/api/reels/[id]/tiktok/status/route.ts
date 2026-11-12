import { handle, requireReel } from "@/lib/auth";
import { getConnection, getReel, saveReel } from "@/lib/db";
import { accessToken, publishStatus } from "@/lib/tiktok";
import type { Publication } from "@/lib/types";

/** Checks TikTok for posts that are still processing and updates the Reel. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/tiktok/status">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);
  const pending = (reel.publications ?? []).filter((p) => p.provider === "tiktok" && p.status === "processing");
  const conn = await getConnection(brand.id, "tiktok");
  if (!pending.length || !conn) return Response.json(reel);

  const token = await accessToken(conn);
  const updates = new Map<string, Partial<Publication>>();
  for (const p of pending) {
    const st = await publishStatus(token, p.publishId).catch(() => null);
    if (!st) continue;
    if (st.status === "PUBLISH_COMPLETE" || st.status === "SEND_TO_USER_INBOX") {
      updates.set(p.publishId, { status: "published", postId: st.publicaly_available_post_id?.[0]?.toString() });
    } else if (st.status === "FAILED") {
      updates.set(p.publishId, { status: "failed", error: st.fail_reason || "TikTok couldn't publish the video." });
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
