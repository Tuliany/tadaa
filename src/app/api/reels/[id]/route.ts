import { isStyleId } from "@/lib/styles";
import { handle, requireReel } from "@/lib/auth";
import { getBrand } from "@/lib/db";
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
  if (body.script) {
    // Look tweaks only ever come from the brand's saved references, never straight from the client.
    const { styleOverrides: _ignored, referenceId, ...rest } = body.script;
    void _ignored;
    body.script = rest;
    if (referenceId) {
      const ref = (await getBrand(reel.brandId))?.references?.find((r) => r.id === referenceId);
      if (ref) body.script = { ...rest, style: ref.base, styleOverrides: ref.overrides, referenceId: ref.id };
    } else if (rest.style !== undefined) {
      body.script = { ...rest, styleOverrides: undefined, referenceId: undefined };
    }
  }

  const next: Reel = { ...reel, updatedAt: new Date().toISOString() };
  if (body.status === "approved" || body.status === "draft") next.status = body.status;
  if (body.script) {
    next.script = { ...reel.script, ...body.script, template: reel.script.template };
    if (body.script.style !== undefined && !isStyleId(body.script.style)) next.script.style = reel.script.style;
    next.status = "draft";
    next.renderFile = undefined;
  }
  await saveReel(next);
  return Response.json(next);
});
