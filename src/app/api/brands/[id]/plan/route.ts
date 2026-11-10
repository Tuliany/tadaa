import { generatePlan } from "@/lib/ai";
import { getBrand, getPlan, savePlan } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/brands/[id]/plan">) {
  const { id } = await ctx.params;
  return Response.json(await getPlan(id));
}

export async function POST(_req: Request, ctx: RouteContext<"/api/brands/[id]/plan">) {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });
  try {
    const ideas = await generatePlan(brand);
    return Response.json(await savePlan({ brandId: id, ideas, createdAt: new Date().toISOString() }));
  } catch (e) {
    return Response.json({ error: `Could not create the plan: ${(e as Error).message}` }, { status: 502 });
  }
}
