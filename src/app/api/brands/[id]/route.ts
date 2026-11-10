import { getBrand, saveBrand } from "@/lib/db";
import type { Brand } from "@/lib/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/brands/[id]">) {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  return brand ? Response.json(brand) : Response.json({ error: "Not found" }, { status: 404 });
}

const EDITABLE: (keyof Brand)[] = [
  "name",
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
];

export async function PUT(req: Request, ctx: RouteContext<"/api/brands/[id]">) {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return Response.json({ error: "Not found" }, { status: 404 });
  const patch = (await req.json()) as Partial<Brand>;
  const next = { ...brand } as Record<string, unknown>;
  for (const key of EDITABLE) if (key in patch) next[key] = patch[key];
  await saveBrand(next as unknown as Brand);
  return Response.json(next);
}
