import { generatePlan } from "@/lib/ai";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { getPlan, savePlan } from "@/lib/db";

export const maxDuration = 60;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/plan">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(await getPlan(brand.id));
});

export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/plan">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const id = brand.id;
  try {
    const ideas = await generatePlan(brand);
    return Response.json(await savePlan({ brandId: id, ideas, createdAt: new Date().toISOString() }));
  } catch (e) {
    throw new HttpError(502, `Could not create the plan: ${(e as Error).message}`);
  }
});
