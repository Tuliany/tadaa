import { handle, HttpError, requireBrand } from "@/lib/auth";
import { getSlot, listMedia, listReels, saveSlot } from "@/lib/db";
import { createReel, ReelWriteError, type MemeInput } from "@/lib/reels";
import { TEMPLATES } from "@/lib/templates";
import type { TemplateId } from "@/lib/types";

export const maxDuration = 60;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(await listReels(brand.id));
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) => {
  const { brand, user } = await requireBrand((await ctx.params).id);
  const body = (await req.json()) as {
    topic?: string;
    template?: TemplateId;
    mediaIds?: string[];
    style?: string;
    referenceId?: string;
    meme?: MemeInput;
    slotId?: string;
  };
  const topic = body.topic?.trim();
  if (!topic) throw new HttpError(400, "Tell us what this Reel is about.");
  const template: TemplateId = body.template && body.template in TEMPLATES ? body.template : "showcase";

  const all = await listMedia(brand.id);
  const media = (body.mediaIds ?? []).map((mid) => all.find((m) => m.id === mid)).filter((m) => !!m);
  if (template === "beforeAfter" && media.length < 2) {
    throw new HttpError(400, "Before & After needs two photos: the before first, then the after.");
  }
  if (template === "meme" && !media.length) throw new HttpError(400, "A meme needs a clip.");
  if (template === "talk" && media[0]?.kind !== "video") throw new HttpError(400, "A talking video needs a video.");

  try {
    const reel = await createReel({ brand, user, topic, template, media, style: body.style, referenceId: body.referenceId, meme: body.meme, rememberLook: true });
    if (body.slotId) await linkSlot(brand.id, body.slotId, reel.id);
    return Response.json(reel);
  } catch (e) {
    if (e instanceof ReelWriteError) throw new HttpError(502, e.message);
    throw e;
  }
});

/** A Reel made from a calendar idea fills that slot. */
async function linkSlot(brandId: string, slotId: string, reelId: string) {
  const slot = await getSlot(slotId);
  if (slot && slot.brandId === brandId && !slot.reelId) await saveSlot({ ...slot, reelId, note: undefined, updatedAt: new Date().toISOString() });
}
