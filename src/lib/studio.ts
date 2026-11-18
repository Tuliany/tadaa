import { nanoid } from "nanoid";
import { calendarIdeas } from "./ai";
import { PlanLimitError, deleteSlot, getUser, listAllBrands, listMedia, listReels, listSlots, saveBrand, saveSlot } from "./db";
import { occasionsBetween } from "./occasions";
import { PLANS, planOf } from "./plans";
import { createReel } from "./reels";
import type { Brand, MediaItem, Slot, TemplateId } from "./types";

/** Idea Studio: a content calendar per brand with ideas, drafts made ahead, and an approval queue. */

/** Tuesday and Friday. Automatic drafts are off until the customer turns them on (they use the plan's Reels). */
export const DEFAULT_SCHEDULE = { days: [2, 5], autoDraft: false };
export const PLAN_WEEKS = 4;
/** At most this many posts are planned ahead (more appear as days pass). */
export const MAX_PLANNED = 12;
/** Drafts are made this many days before their posting date. */
export const DRAFT_AHEAD_DAYS = 3;

const ZONES: Record<string, string> = { sv: "Europe/Stockholm", es: "Europe/Madrid", de: "Europe/Berlin", fr: "Europe/Paris", en: "Europe/London" };

/** Today's date (YYYY-MM-DD) where the brand is. */
export function today(brand: Pick<Brand, "language">, at = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: ZONES[brand.language] ?? "UTC" }).format(at);
}
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
/** 1 = Monday … 7 = Sunday */
export const isoWeekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function scheduleOf(brand: Brand) {
  const s = brand.schedule ?? DEFAULT_SCHEDULE;
  // Automatic drafts count only when the customer turned them on themselves.
  return { ...s, autoDraft: !!(s.autoDraft && "autoDraftOnAt" in s && s.autoDraftOnAt) };
}

/** Posting dates from today for the next `weeks` weeks. */
export function upcomingDates(brand: Brand, weeks = PLAN_WEEKS) {
  const days = new Set(scheduleOf(brand).days);
  const start = today(brand);
  const out: string[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    if (days.has(isoWeekday(d))) out.push(d);
  }
  return out.slice(0, MAX_PLANNED);
}

async function recentTopics(brand: Brand, slots: Slot[]) {
  const reels = await listReels(brand.id);
  return [...slots.filter((s) => !s.skipped).map((s) => s.title), ...reels.slice(0, 15).map((r) => r.topic)];
}

const canMeme = (media: MediaItem[]) => media.some((m) => m.kind === "video");

const running = new Map<string, Promise<Slot[]>>();

/** One planner per brand at a time, so two open tabs don't plan the same dates twice. */
function locked(brand: Brand, fn: () => Promise<Slot[]>) {
  const busy = running.get(brand.id);
  if (busy) return busy;
  const p = fn().finally(() => running.delete(brand.id));
  running.set(brand.id, p);
  return p;
}

const missingDates = (brand: Brand, slots: Slot[]) => {
  const have = new Set(slots.flatMap((s) => [s.date, s.plannedFor ?? s.date]));
  return upcomingDates(brand).filter((d) => !have.has(d));
};

/** Plans every missing posting date (waits for all of it), a few at a time so the page fills in steadily. */
export function ensureCalendar(brand: Brand): Promise<Slot[]> {
  return locked(brand, async () => {
    let slots = await listSlots(brand.id);
    for (let left = missingDates(brand, slots).length; left > 0; ) {
      slots = await fillCalendar(brand, FIRST_BATCH);
      const now = missingDates(brand, slots).length;
      if (now >= left) break; // no progress; try again on the next run
      left = now;
    }
    return slots;
  });
}

/** How many posts are planned right away when someone is waiting; the rest are written in the background. */
const FIRST_BATCH = 4;

/**
 * For pages: plans the first few missing posts right away and the rest in the background.
 * `planning` is true while more ideas are on their way.
 */
export async function calendarNow(brand: Brand): Promise<{ slots: Slot[]; planning: boolean }> {
  if (running.has(brand.id)) return { slots: await listSlots(brand.id), planning: true };
  const existing = await listSlots(brand.id);
  const missing = missingDates(brand, existing);
  if (!missing.length) return { slots: existing, planning: false };
  try {
    await locked(brand, () => fillCalendar(brand, FIRST_BATCH));
  } catch (e) {
    // Show what's already planned; the missing posts are tried again on the next visit or run.
    if (existing.length) {
      console.error("[studio] planning", brand.id, e);
      return { slots: existing, planning: false };
    }
    throw e;
  }
  if (missing.length <= FIRST_BATCH) return { slots: await listSlots(brand.id), planning: false };
  void ensureCalendar(brand).catch((e) => console.error("[studio] planning", brand.id, e));
  return { slots: await listSlots(brand.id), planning: true };
}

async function fillCalendar(brand: Brand, limit = Infinity) {
  const slots = await listSlots(brand.id);
  const missing = missingDates(brand, slots).slice(0, limit);
  if (!missing.length) return slots;
  const media = await listMedia(brand.id);
  const ideas = await calendarIdeas(
    brand,
    missing,
    occasionsBetween(brand.language, today(brand), addDays(missing[missing.length - 1], 7)),
    await recentTopics(brand, slots),
    canMeme(media),
  );
  const now = new Date().toISOString();
  for (const idea of ideas) {
    slots.push(
      await saveSlot({
        id: nanoid(10),
        brandId: brand.id,
        date: idea.date,
        title: idea.title,
        topic: idea.topic,
        hook: idea.hook,
        template: idea.template as TemplateId,
        occasion: idea.occasion ?? undefined,
        needsMedia: idea.needsMedia,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  return slots.sort((a, b) => a.date.localeCompare(b.date));
}

/** Changes the posting days: unused future slots on dropped days are removed, new days get ideas. */
export async function setSchedule(brand: Brand, schedule: { days: number[]; autoDraft: boolean; autoDraftOnAt?: string }) {
  const days = [...new Set(schedule.days)].filter((d) => d >= 1 && d <= 7).sort();
  if (!days.length) throw new Error("Pick at least one day.");
  const next = await saveBrand({ ...brand, schedule: { days, autoDraft: schedule.autoDraft, autoDraftOnAt: schedule.autoDraft ? schedule.autoDraftOnAt : undefined } });
  const from = today(brand);
  for (const s of await listSlots(brand.id)) {
    if (s.date >= from && !s.reelId && !days.includes(isoWeekday(s.date))) await deleteSlot(s.id);
  }
  return calendarNow(next);
}

/** Replaces one slot's idea with a fresh one. */
export async function newIdea(brand: Brand, slot: Slot) {
  if (slot.reelId) throw new Error("This post already has a draft Reel.");
  const slots = await listSlots(brand.id);
  const [idea] = await calendarIdeas(
    brand,
    [slot.date],
    occasionsBetween(brand.language, addDays(slot.date, -3), addDays(slot.date, 7)),
    [slot.title, ...(await recentTopics(brand, slots))],
    canMeme(await listMedia(brand.id)),
  );
  return saveSlot({
    ...slot,
    title: idea.title,
    topic: idea.topic,
    hook: idea.hook,
    template: idea.template as TemplateId,
    occasion: idea.occasion ?? undefined,
    needsMedia: idea.needsMedia,
    skipped: false,
    note: undefined,
    updatedAt: new Date().toISOString(),
  });
}

/** Photos/clips for a draft: the brand's least-used media first, so the feed doesn't repeat itself. */
export async function pickMedia(brand: Brand, template: TemplateId) {
  const [media, reels] = await Promise.all([listMedia(brand.id), listReels(brand.id)]);
  const used = new Map<string, number>();
  for (const r of reels) for (const id of r.mediaIds) used.set(id, (used.get(id) ?? 0) + 1);
  const rank = (list: MediaItem[]) =>
    [...list].sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || b.createdAt.localeCompare(a.createdAt));
  if (template === "meme") return rank(media.filter((m) => m.kind === "video")).slice(0, 1);
  const images = rank(media.filter((m) => m.kind === "image"));
  const videos = rank(media.filter((m) => m.kind === "video"));
  return [...images, ...videos].slice(0, 4);
}

export class NoMediaError extends Error {}

/** Writes the draft Reel for a slot (counts against the plan). */
export async function draftSlot(brand: Brand, owner: { id: string }, slot: Slot) {
  if (slot.reelId) return slot;
  let template = slot.template;
  let media = await pickMedia(brand, template);
  if (template === "meme" && !media.length) {
    template = "showcase";
    media = await pickMedia(brand, template);
  }
  if (!media.length) throw new NoMediaError("Add a few photos or clips to this brand first.");
  const topic = `${slot.title}: ${slot.topic}${slot.hook ? ` (suggested opening: "${slot.hook}")` : ""}`;
  const reel = await createReel({ brand, user: owner, topic, template, media });
  return saveSlot({ ...slot, template, reelId: reel.id, note: undefined, updatedAt: new Date().toISOString() });
}

/**
 * Background job: for brands on a paid plan with automatic drafts on, make the drafts for
 * posts due within DRAFT_AHEAD_DAYS. Trial accounts make drafts themselves (it uses their free Reels).
 */
export async function autoDraftDue() {
  let made = 0;
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  for (const brand of await listAllBrands()) {
    try {
      made += await autoDraftBrand(brand, monthAgo);
    } catch (e) {
      console.error("[studio] brand", brand.id, e);
    }
  }
  return made;
}

/** Tops up one brand's calendar and makes its due drafts (paid plans with automatic drafts on). */
export async function autoDraftBrand(brand: Brand, activeSince = new Date(Date.now() - 30 * 86400_000).toISOString()) {
  let made = 0;
  if (!brand.ownerId) return 0;
  const owner = await getUser(brand.ownerId);
  if (!owner) return 0;
  const plan = planOf(owner);
  if (plan === "trial") {
    // Keep the calendar planned ahead (so it opens instantly) for trial brands that are in use.
    const active = (await listReels(brand.id)).some((r) => r.createdAt > activeSince);
    if (active) await ensureCalendar(brand).catch((e) => console.error("[studio] top-up", brand.id, e));
    return 0;
  }
  const slots = await ensureCalendar(brand).catch(() => listSlots(brand.id));
  if (!scheduleOf(brand).autoDraft) return 0;
  const from = today(brand);
  const until = addDays(from, DRAFT_AHEAD_DAYS);
  const due = slots.filter((s) => s.date >= from && s.date <= until && !s.reelId && !s.skipped && !s.note);
  for (const slot of due) {
    try {
      await draftSlot(brand, owner, slot);
      made++;
    } catch (e) {
      const note =
        e instanceof PlanLimitError
          ? `You've used this month's ${PLANS[plan].reels} Reels, so no draft was made. Make it yourself or upgrade.`
          : e instanceof NoMediaError
            ? e.message
            : "Couldn't make this draft automatically. Click “Make draft” to try again.";
      await saveSlot({ ...slot, note, updatedAt: new Date().toISOString() });
      if (e instanceof PlanLimitError) break;
    }
  }
  return made;
}
