import { nanoid } from "nanoid";
import { writeReelScript } from "@/lib/ai";
import { getBrand, listMedia, listReels, saveReel } from "@/lib/db";
import { TEMPLATES } from "@/lib/templates";
import type { Reel, TemplateId } from "@/lib/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) {
  const { id } = await ctx.params;
  return Response.json(await listReels(id));
}

export async function POST(req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) {
  const { id } = await ctx.params;
  const brand = await getBrand(id);
  if (!brand) return Response.json({ error: "Brand not found" }, { status: 404 });

  const body = (await req.json()) as { topic?: string; template?: TemplateId; mediaIds?: string[] };
  const topic = body.topic?.trim();
  if (!topic) return Response.json({ error: "Tell us what this Reel is about." }, { status: 400 });
  const template: TemplateId = body.template && body.template in TEMPLATES ? body.template : "showcase";

  const all = await listMedia(id);
  const media = (body.mediaIds ?? []).map((mid) => all.find((m) => m.id === mid)).filter((m) => !!m);
  if (template === "beforeAfter" && media.length < 2) {
    return Response.json({ error: "Before & After needs two photos: the before first, then the after." }, { status: 400 });
  }

  try {
    const script = await writeReelScript(brand, topic, template, media);
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
    return Response.json({ error: `Could not write the Reel: ${(e as Error).message}` }, { status: 502 });
  }
}
