import { handle, HttpError, requireBrand } from "@/lib/auth";
import { getSlot, PlanLimitError, saveSlot } from "@/lib/db";
import { ReelWriteError } from "@/lib/reels";
import { draftSlot, newIdea, NoMediaError, today } from "@/lib/studio";

export const maxDuration = 60;

/** Actions on one calendar post: draft | newIdea | skip | unskip | move | retryPost. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/slots/[id]">) => {
  const slot = await getSlot((await ctx.params).id);
  if (!slot) throw new HttpError(404, "Post not found");
  const { brand, user } = await requireBrand(slot.brandId);
  const body = (await req.json()) as { action?: string; date?: string };
  const now = new Date().toISOString();

  switch (body.action) {
    case "draft":
      try {
        return Response.json(await draftSlot(brand, user, slot));
      } catch (e) {
        if (e instanceof PlanLimitError) throw e;
        if (e instanceof NoMediaError) throw new HttpError(400, e.message);
        if (e instanceof ReelWriteError) throw new HttpError(502, e.message);
        throw e;
      }
    case "newIdea":
      try {
        return Response.json(await newIdea(brand, slot));
      } catch (e) {
        throw new HttpError(502, `Could not think of a new idea: ${(e as Error).message}`);
      }
    case "retryPost":
      // A failed automatic post is tried again at the next run (only on its own day).
      if (slot.posting?.status === "posting") throw new HttpError(400, "It's being posted right now.");
      if (slot.date !== today(brand)) throw new HttpError(400, "Its day has passed. Post it yourself from the Reel page.");
      return Response.json(await saveSlot({ ...slot, posting: undefined, updatedAt: now }));
    case "skip":
      return Response.json(await saveSlot({ ...slot, skipped: true, updatedAt: now }));
    case "unskip":
      return Response.json(await saveSlot({ ...slot, skipped: false, updatedAt: now }));
    case "move": {
      const date = String(body.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw new HttpError(400, "Pick a date.");
      if (date < today(brand)) throw new HttpError(400, "Pick a date from today on.");
      return Response.json(await saveSlot({ ...slot, date, plannedFor: slot.plannedFor ?? slot.date, note: undefined, updatedAt: now }));
    }
    default:
      throw new HttpError(400, "Unknown action");
  }
});
