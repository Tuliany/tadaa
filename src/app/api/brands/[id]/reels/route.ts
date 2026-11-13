import { nanoid } from "nanoid";
import { writeReelScript } from "@/lib/ai";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { listMedia, listReels, saveBrand, saveReel } from "@/lib/db";
import { isStyleId, pickStyle } from "@/lib/styles";
import { TEMPLATES } from "@/lib/templates";
import type { Reel, TemplateId } from "@/lib/types";

export const maxDuration = 60;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(await listReels(brand.id));
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const id = brand.id;

  const body = (await req.json()) as { topic?: string; template?: TemplateId; mediaIds?: string[]; style?: string };
  const topic = body.topic?.trim();
  if (!topic) throw new HttpError(400, "Tell us what this Reel is about.");
  const template: TemplateId = body.template && body.template in TEMPLATES ? body.template : "showcase";

  const all = await listMedia(id);
  const media = (body.mediaIds ?? []).map((mid) => all.find((m) => m.id === mid)).filter((m) => !!m);
  if (template === "beforeAfter" && media.length < 2) {
    throw new HttpError(400, "Before & After needs two photos: the before first, then the after.");
  }

  try {
    const style = isStyleId(body.style) ? body.style : pickStyle(brand);
    const script = { ...(await writeReelScript(brand, topic, template, media)), style };
    // Remember the look so the next Reel starts with it.
    if (isStyleId(body.style) && brand.defaultStyle !== body.style) await saveBrand({ ...brand, defaultStyle: body.style });
    const now = new Date().toISOString();
    const reel: Reel = {
      id: nanoid(10),
      brandId: id,
      topic,
      script,
      mediaIds: media.map((m) => m.id),
      status: "draft",
      revisions: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveReel(reel);
    return Response.json(reel);
  } catch (e) {
    throw new HttpError(502, `Could not write the Reel: ${(e as Error).message}`);
  }
});
