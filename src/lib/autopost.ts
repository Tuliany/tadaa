import { getConnection, getReel, getUser, listAllBrands, listSlots, saveSlot } from "./db";
import { planOf } from "./plans";
import { defaultCaption, ensureRendered, metaTargets, postToLinkedIn, postToMeta, refreshPublications } from "./publish";
import { hasRender } from "./render";
import { today, zoneOf } from "./studio";
import type { AutoChannel, AutoPost, Brand, Reel, Slot } from "./types";

/**
 * Idea Studio part 2: approved Reels in the calendar are posted automatically on their day,
 * at the brand's posting time, to the channels the customer picked. Opt-in, paid plans only.
 * TikTok is left out on purpose: its rules require the person to confirm each post.
 */

export const AUTO_CHANNELS: AutoChannel[] = ["instagram", "facebook", "linkedin"];
export const DEFAULT_AUTOPOST: AutoPost = { on: false, time: "09:00", channels: [] };
export const CHANNEL_NAME: Record<AutoChannel, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn" };

export function autoPostOf(brand: Brand): AutoPost {
  const a = brand.autoPost ?? DEFAULT_AUTOPOST;
  // Only counts when the customer turned it on themselves.
  return { ...DEFAULT_AUTOPOST, ...a, on: !!(a.on && a.onAt) };
}

/** The brand's local clock time, "HH:MM". */
export function localTime(brand: Pick<Brand, "language">, at = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zoneOf(brand), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/** Which of the auto-postable channels this brand has connected. */
export async function connectedChannels(brandId: string): Promise<Record<AutoChannel, string | null>> {
  const [{ page, ig }, li] = await Promise.all([metaTargets(brandId), getConnection(brandId, "linkedin")]);
  return {
    instagram: ig ? (ig.acc.igUsername ? `@${ig.acc.igUsername}` : ig.acc.name) : null,
    facebook: page ? page.name : null,
    linkedin: li ? li.displayName : null,
  };
}

const plannedFrom = (a: AutoPost) => (a.onAt ? a.onAt.slice(0, 10) : "9999");

/** Posts one slot's Reel to the chosen channels. Returns the slot's new posting state. */
export async function postSlot(brand: Brand, reel: Reel, channels: AutoChannel[]): Promise<NonNullable<Slot["posting"]>> {
  const errors: string[] = [];
  const posted: AutoChannel[] = [];
  const connected = await connectedChannels(brand.id);
  for (const c of channels) if (!connected[c]) errors.push(`${CHANNEL_NAME[c]}: not connected any more (Accounts → ${CHANNEL_NAME[c]}).`);
  const ig = channels.includes("instagram") && !!connected.instagram;
  const fb = channels.includes("facebook") && !!connected.facebook;
  const li = channels.includes("linkedin") && !!connected.linkedin;

  if (!ig && !fb && !li) return { status: "failed", at: new Date().toISOString(), channels, errors };

  let current = reel;
  try {
    current = await ensureRendered(brand, reel);
  } catch (e) {
    return { status: "failed", at: new Date().toISOString(), channels, errors: [(e as Error).message] };
  }

  if (ig || fb) {
    // Instagram allows at most 30 hashtags.
    const hashtags = current.script.hashtags.slice(0, 30);
    const caption = defaultCaption({ ...current, script: { ...current.script, hashtags } }, 2200);
    try {
      const r = await postToMeta(brand, current, { caption, instagram: ig, facebook: fb, shareToFeed: true });
      errors.push(...r.errors);
      if (ig && !r.errors.some((e) => e.startsWith("Instagram"))) posted.push("instagram");
      if (fb && !r.errors.some((e) => e.startsWith("Facebook"))) posted.push("facebook");
      current = r.reel;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (li) {
    try {
      current = await postToLinkedIn(brand, current, defaultCaption(current, 3000));
      posted.push("linkedin");
    } catch (e) {
      errors.push(`LinkedIn: ${(e as Error).message}`);
    }
  }
  return {
    status: posted.length ? "posted" : "failed",
    at: new Date().toISOString(),
    channels: posted.length ? posted : channels,
    ...(errors.length ? { errors } : {}),
  };
}

let ticking = false;

/** Background job (every few minutes): post what's due, render what's coming, follow up on posts. */
export async function autoPostTick() {
  if (ticking) return 0;
  ticking = true;
  let posted = 0;
  try {
    for (const brand of await listAllBrands()) {
      try {
        posted += await autoPostBrand(brand);
      } catch (e) {
        console.error("[autopost] brand", brand.id, e);
      }
    }
  } finally {
    ticking = false;
  }
  return posted;
}

async function autoPostBrand(brand: Brand) {
  const auto = autoPostOf(brand);
  const slots = await listSlots(brand.id);
  const day = today(brand);
  let posted = 0;

  // Follow up on recent automatic posts (Instagram publishes only once its processing is done).
  for (const s of slots) {
    if (s.posting?.status !== "posted" || !s.reelId || Date.now() - Date.parse(s.posting.at) > 2 * 86400_000) continue;
    const reel = await getReel(s.reelId);
    if (reel?.publications?.some((p) => p.status === "processing")) await refreshPublications(brand, reel).catch(() => {});
  }

  if (!auto.on || !auto.channels.length || !brand.ownerId) return 0;
  const owner = await getUser(brand.ownerId);
  if (!owner || planOf(owner) === "trial") return 0;

  for (const s of slots) {
    if (!s.reelId || s.skipped || s.posting || s.date < plannedFrom(auto)) continue;
    const reel = await getReel(s.reelId);
    if (!reel || reel.status !== "approved") continue;

    if (s.date < day) {
      // The day passed without posting (e.g. approved too late, or we were down). Don't post late on our own.
      await saveSlot({ ...s, posting: { status: "failed", at: new Date().toISOString(), channels: auto.channels, errors: ["Not posted: its day passed. Post it yourself from the Reel page."] }, updatedAt: new Date().toISOString() });
      continue;
    }
    // Already posted by hand on the chosen channels: don't post it twice.
    const byHand = (reel.publications ?? []).filter((p) => p.status !== "failed" && (auto.channels as string[]).includes(p.provider));
    if (byHand.length && s.date <= day) {
      await saveSlot({ ...s, posting: { status: "posted", at: byHand[0].createdAt, channels: byHand.map((p) => p.provider as AutoChannel) }, updatedAt: new Date().toISOString() });
      continue;
    }
    if (s.date === day && localTime(brand) >= auto.time) {
      // Claim it first so a slow post is never started twice.
      const claimed = await saveSlot({ ...s, posting: { status: "posting", at: new Date().toISOString(), channels: auto.channels }, updatedAt: new Date().toISOString() });
      let result: NonNullable<Slot["posting"]>;
      try {
        result = await postSlot(brand, reel, auto.channels);
      } catch (e) {
        result = { status: "failed", at: new Date().toISOString(), channels: auto.channels, errors: [(e as Error).message] };
      }
      await saveSlot({ ...claimed, posting: result, updatedAt: new Date().toISOString() });
      if (result.status === "posted") posted++;
      console.log(`[autopost] ${brand.name} ${s.date}: ${result.status} ${result.channels.join(",")} ${result.errors?.join(" | ") ?? ""}`);
    } else if (s.date <= addDay(day) && !(await hasRender(reel))) {
      // Due today or tomorrow: render the video ahead of time so posting is quick. One per run.
      await ensureRendered(brand, reel).catch((e) => console.error("[autopost] pre-render", reel.id, e));
      return posted;
    }
  }
  return posted;
}

const addDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);

/** A post stuck in "posting" (e.g. the server restarted mid-post) is shown as failed after an hour. */
export function postingView(s: Slot): Slot["posting"] {
  if (s.posting?.status === "posting" && Date.now() - Date.parse(s.posting.at) > 3600_000) {
    return { ...s.posting, status: "failed", errors: ["Posting was interrupted. Check your accounts, then post it yourself from the Reel page."] };
  }
  return s.posting;
}
