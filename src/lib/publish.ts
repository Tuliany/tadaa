import { getConnection, getReel, saveReel } from "./db";
import { selectedAccount } from "./instagram";
import { accessToken as liToken, authorOf, postUrl, publishVideo as publishLinkedIn, videoStatus } from "./linkedin";
import { advanceInstagramReel, facebookReelStatus, publishFacebookReel, selectedPage, startInstagramReel } from "./meta";
import { hasRender, startRender } from "./render";
import { localFile } from "./storage";
import { accessToken as ttToken, publishStatus } from "./tiktok";
import type { Brand, MetaPage, Publication, Reel, SocialProvider } from "./types";

/**
 * Posting a Reel to the platforms, shared by the "Post" buttons and automatic posting.
 * Problems the person can fix (not connected, not approved…) throw PublishError with a friendly message.
 */
export class PublishError extends Error {}

/** The Reel with an up-to-date MP4 (renders it first if needed). */
export async function ensureRendered(brand: Brand, reel: Reel): Promise<Reel> {
  if (await hasRender(reel)) return reel;
  try {
    await startRender(brand, reel);
  } catch (e) {
    console.error("[publish] render failed", reel.id, e);
    throw new PublishError("The video couldn't be created, so nothing was posted. Please try again in a minute.");
  }
  return (await getReel(reel.id)) ?? reel;
}

/** The default post text: the Reel's caption and hashtags. */
export function defaultCaption(reel: Reel, max: number) {
  return `${reel.script.caption}\n\n${reel.script.hashtags.join(" ")}`.trim().slice(0, max);
}

async function addPublications(reel: Reel, pubs: Publication[]) {
  const latest = (await getReel(reel.id)) ?? reel;
  return saveReel({ ...latest, publications: [...(latest.publications ?? []), ...pubs], updatedAt: new Date().toISOString() });
}

export async function postToLinkedIn(brand: Brand, reel: Reel, text: string) {
  if (reel.status !== "approved") throw new PublishError("Approve the Reel before posting it.");
  const conn = await getConnection(brand.id, "linkedin");
  if (!conn) throw new PublishError("Connect LinkedIn first (Accounts → LinkedIn).");
  const token = await liToken(conn);
  const current = await ensureRendered(brand, reel);
  const { postUrn, videoUrn } = await publishLinkedIn(conn, token, await localFile("renders", current.renderFile!), text, reel.script.hook || brand.name);
  const now = new Date().toISOString();
  return addPublications(current, [
    {
      provider: "linkedin",
      accountName: authorOf(conn).name,
      publishId: videoUrn,
      postId: postUrn,
      permalink: postUrl(postUrn),
      privacy: "PUBLIC",
      status: "processing",
      via: "linkedin",
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

/** Which Instagram account and Facebook Page this brand posts to (null when not connected). */
export async function metaTargets(brandId: string) {
  const [conn, igConn] = await Promise.all([getConnection(brandId, "meta"), getConnection(brandId, "instagram")]);
  let page: MetaPage | null = null;
  try {
    page = conn ? selectedPage(conn) : null;
  } catch {
    page = null;
  }
  // Instagram: the directly connected account wins; otherwise the Instagram linked to the Facebook Page.
  let ig: { acc: MetaPage; via: SocialProvider } | null = null;
  try {
    if (igConn) ig = { acc: selectedAccount(igConn), via: "instagram" };
  } catch {
    ig = null;
  }
  if (!ig && page?.igId) ig = { acc: page, via: "meta" };
  return { page, ig };
}

export async function postToMeta(
  brand: Brand,
  reel: Reel,
  s: { caption: string; instagram: boolean; facebook: boolean; shareToFeed: boolean },
) {
  if (!s.instagram && !s.facebook) throw new PublishError("Choose Instagram, Facebook or both.");
  if (reel.status !== "approved") throw new PublishError("Approve the Reel before posting it.");
  if ((s.caption.match(/#/g) ?? []).length > 30) throw new PublishError("Instagram allows at most 30 hashtags.");
  const { page, ig } = await metaTargets(brand.id);
  if (s.facebook && !page) throw new PublishError("Connect Facebook first (Accounts → Facebook).");
  if (s.instagram && !ig) throw new PublishError("Connect Instagram first (Accounts → Instagram).");

  const current = await ensureRendered(brand, reel);
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
  if (!pubs.length) throw new PublishError(errors.join(" "));
  return { reel: await addPublications(current, pubs), errors };
}

/**
 * Follows up on posts still processing: marks them published or failed, and publishes
 * Instagram Reels once Instagram has finished processing the video.
 */
export async function refreshPublications(brand: Brand, reel: Reel): Promise<Reel> {
  const pending = (reel.publications ?? []).filter((p) => p.status === "processing");
  if (!pending.length) return reel;

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
        const st = await publishStatus(await ttToken(tt), p.publishId);
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
  if (!updates.size) return reel;
  const latest = (await getReel(reel.id)) ?? reel;
  const now = new Date().toISOString();
  return saveReel({
    ...latest,
    publications: (latest.publications ?? []).map((p) => (updates.has(p.publishId) ? { ...p, ...updates.get(p.publishId), updatedAt: now } : p)),
  });
}
