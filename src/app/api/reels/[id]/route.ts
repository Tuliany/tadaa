import { getReel, saveReel } from "@/lib/db";
import type { Reel, ReelScript } from "@/lib/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/reels/[id]">) {
  const { id } = await ctx.params;
  const reel = await getReel(id);
  return reel ? Response.json(reel) : Response.json({ error: "Not found" }, { status: 404 });
}

/** Approve / un-approve, or save manual text edits to the script. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/reels/[id]">) {
  const { id } = await ctx.params;
  const reel = await getReel(id);
  if (!reel) return Response.json({ error: "Not found" }, { status: 404 });
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
}
