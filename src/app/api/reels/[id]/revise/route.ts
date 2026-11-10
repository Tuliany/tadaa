import { reviseReelScript } from "@/lib/ai";
import { getBrand, getReel, listMedia, saveReel } from "@/lib/db";

/** Apply a plain-language change request ("make the hook funnier") to a Reel. */
export async function POST(req: Request, ctx: RouteContext<"/api/reels/[id]/revise">) {
  const { id } = await ctx.params;
  const reel = await getReel(id);
  if (!reel) return Response.json({ error: "Not found" }, { status: 404 });
  const brand = await getBrand(reel.brandId);
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  const { request } = (await req.json()) as { request?: string };
  if (!request?.trim()) return Response.json({ error: "Describe the change you want." }, { status: 400 });

  const all = await listMedia(brand.id);
  const media = reel.mediaIds.map((mid) => all.find((m) => m.id === mid)).filter((m) => !!m);
  try {
    const script = await reviseReelScript(brand, reel.script, request.trim(), media);
    const now = new Date().toISOString();
    const next = {
      ...reel,
      script,
      status: "draft" as const,
      renderFile: undefined,
      revisions: [...reel.revisions, { request: request.trim(), at: now }],
      updatedAt: now,
    };
    await saveReel(next);
    return Response.json(next);
  } catch (e) {
    return Response.json({ error: `Could not apply the change: ${(e as Error).message}` }, { status: 502 });
  }
}
