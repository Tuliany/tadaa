import { generatePlan } from "@/lib/ai";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { getPlan, savePlan } from "@/lib/db";
import { ndjson, wantsStream } from "@/lib/stream";

export const maxDuration = 60;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/plan">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(await getPlan(brand.id));
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/plan">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const id = brand.id;
  // Stream: ideas appear one by one as they're written.
  if (wantsStream(req)) {
    return ndjson(async (send) => {
      const ideas = await generatePlan(brand, send);
      return savePlan({ brandId: id, ideas, createdAt: new Date().toISOString() });
    });
  }
  try {
    const ideas = await generatePlan(brand);
    return Response.json(await savePlan({ brandId: id, ideas, createdAt: new Date().toISOString() }));
  } catch (e) {
    throw new HttpError(502, `Could not create the plan: ${(e as Error).message}`);
  }
});
