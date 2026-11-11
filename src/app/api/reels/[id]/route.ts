import { handle, requireReel } from "@/lib/auth";
import { saveReel } from "@/lib/db";
import type { Reel, ReelScript } from "@/lib/types";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]">) => {
  const { reel } = await requireReel((await ctx.params).id);
  return Response.json(reel);
});

/** Approve / un-approve, or save manual text edits to the script. */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]">) => {
  const { reel } = await requireReel((await ctx.params).id);
  const body = (await req.json()) as { status?: Reel["status"]; script?: Partial<ReelScript> };

  const next: Reel = { ...reel, updatedAt: new Date().toISOString() };
  if (body.status === "approved" || body.status === "draft") next.status = body.status;
  if (body.script) {
    next.script = { ...reel.script, ...body.script, template: reel.script.template };
    next.status = "draft";
    next.renderFile = undefined;
  }
  await saveReel(next);
  return Response.json(next);
});
