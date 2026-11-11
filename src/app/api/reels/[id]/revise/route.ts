import { reviseReelScript } from "@/lib/ai";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { listMedia, saveReel } from "@/lib/db";

export const maxDuration = 60;

/** Apply a plain-language change request ("make the hook funnier") to a Reel. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/revise">) => {
  const { reel, brand } = await requireReel((await ctx.params).id);

  const { request } = (await req.json()) as { request?: string };
  if (!request?.trim()) throw new HttpError(400, "Describe the change you want.");

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
    throw new HttpError(502, `Could not apply the change: ${(e as Error).message}`);
  }
});
