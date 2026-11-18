import { handle, HttpError, requireBrand } from "@/lib/auth";
import { AUTO_CHANNELS, autoPostOf, connectedChannels, postingView } from "@/lib/autopost";
import { listReels, saveBrand, saveSlot } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { autoDraftBrand, calendarNow, DRAFT_AHEAD_DAYS, scheduleOf, setSchedule, today, zoneOf } from "@/lib/studio";
import type { AutoChannel, AutoPost, Brand, Slot } from "@/lib/types";

export const maxDuration = 60;

async function view(brand: Brand, { slots, planning }: { slots: Slot[]; planning: boolean }, plan: string) {
  const reels = await listReels(brand.id);
  const byId = new Map(reels.map((r) => [r.id, r]));
  const from = today(brand);
  const weekAgo = new Date(Date.parse(`${from}T12:00:00Z`) - 7 * 86400_000).toISOString().slice(0, 10);
  const out = [];
  for (const s of slots) {
    // A deleted Reel frees its slot again.
    if (s.reelId && !byId.has(s.reelId)) {
      s.reelId = undefined;
      await saveSlot({ ...s, updatedAt: new Date().toISOString() });
    }
    if (s.date < from && !s.reelId) continue; // past ideas nobody used
    const reel = s.reelId ? byId.get(s.reelId) : undefined;
    out.push({
      ...s,
      posting: postingView(s),
      reel: reel
        ? {
            id: reel.id,
            status: reel.status,
            rendered: !!reel.renderFile,
            hook: reel.script.hook,
            links: (reel.publications ?? []).filter((p) => p.permalink && p.status !== "failed").map((p) => ({ provider: p.provider, url: p.permalink! })),
          }
        : null,
    });
  }
  return {
    today: from,
    planning,
    schedule: scheduleOf(brand),
    autoDraftAvailable: plan !== "trial",
    draftAheadDays: DRAFT_AHEAD_DAYS,
    autoPost: autoPostOf(brand),
    zone: zoneOf(brand),
    channels: await connectedChannels(brand.id),
    // Upcoming posts, drafts still waiting, and last week's posted / not-posted ones.
    slots: out.filter((s) => s.date >= from || (s.reel && s.reel.status === "draft") || (s.posting && s.date >= weekAgo)),
  };
}

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/calendar">) => {
  const { brand, user } = await requireBrand((await ctx.params).id);
  try {
    return Response.json(await view(brand, await calendarNow(brand), planOf(user)));
  } catch (e) {
    throw new HttpError(502, `Could not plan the calendar: ${(e as Error).message}`);
  }
});

/** Change posting days, automatic drafts and automatic posting. */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/calendar">) => {
  const { brand: loaded, user } = await requireBrand((await ctx.params).id);
  const body = (await req.json()) as { days?: number[]; autoDraft?: boolean; autoPost?: Partial<AutoPost> };
  let brand = loaded;
  if (body.autoPost) {
    const cur = autoPostOf(brand);
    const a = body.autoPost;
    const time = typeof a.time === "string" ? a.time : cur.time;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, "Pick a posting time.");
    const channels = Array.isArray(a.channels)
      ? [...new Set(a.channels.filter((c): c is AutoChannel => (AUTO_CHANNELS as string[]).includes(c)))]
      : cur.channels;
    const on = typeof a.on === "boolean" ? a.on : cur.on;
    if (on && planOf(user) === "trial") throw new HttpError(402, "Automatic posting is part of the paid plans.");
    if (on && !channels.length) throw new HttpError(400, "Choose where to post first.");
    // Remember when it was turned on: only posts from that day on are posted automatically.
    const onAt = !on ? undefined : a.on === true && !cur.on ? new Date().toISOString() : brand.autoPost?.onAt;
    brand = await saveBrand({ ...brand, autoPost: { on, onAt, time, channels } });
    if (body.days === undefined && body.autoDraft === undefined) {
      return Response.json(await view(brand, await calendarNow(brand), planOf(user)));
    }
  }
  const current = scheduleOf(brand);
  const days = Array.isArray(body.days) ? body.days.map(Number).filter((d) => Number.isInteger(d)) : current.days;
  if (!days.length) throw new HttpError(400, "Pick at least one posting day.");
  if (days.length > 7) throw new HttpError(400, "That's more days than a week has.");
  const autoDraft = typeof body.autoDraft === "boolean" ? body.autoDraft : current.autoDraft;
  const autoDraftOnAt = !autoDraft ? undefined : body.autoDraft === true ? new Date().toISOString() : brand.schedule?.autoDraftOnAt;
  let slots;
  try {
    slots = await setSchedule(brand, { days, autoDraft, autoDraftOnAt });
  } catch (e) {
    throw new HttpError(502, `Saved your posting days, but couldn't plan the new posts: ${(e as Error).message}. Reload to try again.`);
  }
  const next = { ...brand, schedule: { days, autoDraft, autoDraftOnAt } };
  // Just turned on: make the drafts that are already due now rather than at the next run.
  if (body.autoDraft === true) void autoDraftBrand(next).catch((e) => console.error("[studio] draft now", brand.id, e));
  return Response.json(await view(next, slots, planOf(user)));
});
