import { handle, HttpError, requireBrand } from "@/lib/auth";
import { listReels, saveSlot } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { autoDraftBrand, calendarNow, DRAFT_AHEAD_DAYS, scheduleOf, setSchedule, today } from "@/lib/studio";
import type { Brand, Slot } from "@/lib/types";

export const maxDuration = 60;

async function view(brand: Brand, { slots, planning }: { slots: Slot[]; planning: boolean }, plan: string) {
  const reels = await listReels(brand.id);
  const byId = new Map(reels.map((r) => [r.id, r]));
  const from = today(brand);
  const out = [];
  for (const s of slots) {
    // A deleted Reel frees its slot again.
    if (s.reelId && !byId.has(s.reelId)) {
      s.reelId = undefined;
      await saveSlot({ ...s, updatedAt: new Date().toISOString() });
    }
    if (s.date < from && !s.reelId) continue; // past ideas nobody used
    const reel = s.reelId ? byId.get(s.reelId) : undefined;
    out.push({ ...s, reel: reel ? { id: reel.id, status: reel.status, rendered: !!reel.renderFile, hook: reel.script.hook } : null });
  }
  return {
    today: from,
    planning,
    schedule: scheduleOf(brand),
    autoDraftAvailable: plan !== "trial",
    draftAheadDays: DRAFT_AHEAD_DAYS,
    slots: out.filter((s) => s.date >= from || (s.reel && s.reel.status === "draft")),
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

/** Change posting days and automatic drafts. */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/calendar">) => {
  const { brand, user } = await requireBrand((await ctx.params).id);
  const body = (await req.json()) as { days?: number[]; autoDraft?: boolean };
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
