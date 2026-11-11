import { handle, requireBrand } from "@/lib/auth";
import { saveBrand } from "@/lib/db";
import type { Brand } from "@/lib/types";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(brand);
});

const EDITABLE: (keyof Brand)[] = [
  "name",
  "headline",
  "website",
  "instagram",
  "industry",
  "description",
  "audience",
  "voice",
  "offers",
  "claimsToAvoid",
  "colors",
  "logoUrl",
  "language",
  "referenceReels",
];

export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const patch = (await req.json()) as Partial<Brand>;
  const next = { ...brand } as Record<string, unknown>;
  for (const key of EDITABLE) if (key in patch) next[key] = patch[key];
  await saveBrand(next as unknown as Brand);
  return Response.json(next);
});
