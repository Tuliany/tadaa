import { nanoid } from "nanoid";
import { writeReelScript } from "@/lib/ai";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { listMedia, listReels, saveBrand, saveReel } from "@/lib/db";
import { isStyleId, pickStyle } from "@/lib/styles";
import { TEMPLATES } from "@/lib/templates";
import { MEME_MAX_SECONDS } from "@/lib/templates";
import type { MediaItem, Reel, ReelScript, TemplateId } from "@/lib/types";

const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : undefined);

/** The owner's own caption, punchline and chosen moment win over what the AI wrote. */
function applyMeme(script: ReelScript, meme: Parameters<typeof clean>[0], clip: MediaItem) {
  const m = clean(meme);
  if (m.caption) script.hook = m.caption;
  const slide = { ...script.slides[0], mediaId: clip.id, text: m.caption ? m.punchline : (script.slides[0]?.text ?? "") };
  if (clip.kind === "video") {
    const start = Math.min(m.clipStart ?? 0, Math.max(0, (clip.duration ?? Infinity) - 0.5));
    let end = m.clipEnd ?? Math.min(clip.duration ?? start + 6, start + 6);
    if (clip.duration) end = Math.min(end, clip.duration);
    if (end <= start) end = start + 1;
    slide.clipStart = start;
    slide.clipEnd = Math.min(end, start + MEME_MAX_SECONDS);
  } else {
    slide.clipStart = 0;
    slide.clipEnd = 5;
  }
  script.slides = [slide];
  script.sound = m.sound !== false;
}

function clean(meme?: { caption?: string; punchline?: string; clipStart?: number; clipEnd?: number; sound?: boolean }) {
  return {
    caption: typeof meme?.caption === "string" ? meme.caption.trim().slice(0, 110) : "",
    punchline: typeof meme?.punchline === "string" ? meme.punchline.trim().slice(0, 50) : "",
    clipStart: num(meme?.clipStart),
    clipEnd: num(meme?.clipEnd),
    sound: meme?.sound,
  };
}

export const maxDuration = 60;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  return Response.json(await listReels(brand.id));
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/brands/[id]/reels">) => {
  const { brand } = await requireBrand((await ctx.params).id);
  const id = brand.id;

  const body = (await req.json()) as {
    topic?: string;
    template?: TemplateId;
    mediaIds?: string[];
    style?: string;
    referenceId?: string;
    meme?: { caption?: string; punchline?: string; clipStart?: number; clipEnd?: number; sound?: boolean };
  };
  const topic = body.topic?.trim();
  if (!topic) throw new HttpError(400, "Tell us what this Reel is about.");
  const template: TemplateId = body.template && body.template in TEMPLATES ? body.template : "showcase";

  const all = await listMedia(id);
  const media = (body.mediaIds ?? []).map((mid) => all.find((m) => m.id === mid)).filter((m) => !!m);
  if (template === "beforeAfter" && media.length < 2) {
    throw new HttpError(400, "Before & After needs two photos: the before first, then the after.");
  }
  if (template === "meme" && !media.length) throw new HttpError(400, "A meme needs a clip.");

  try {
    // A look learned from a reference video, else a built-in look (else the brand's best match).
    const ref = body.referenceId ? brand.references?.find((r) => r.id === body.referenceId) : undefined;
    const style = ref ? ref.base : isStyleId(body.style) ? body.style : pickStyle(brand);
    const written = await writeReelScript(brand, topic, template, media.slice(0, template === "meme" ? 1 : undefined));
    if (template === "meme") applyMeme(written, body.meme, media[0]);
    const script = {
      ...written,
      style,
      ...(ref ? { styleOverrides: ref.overrides, referenceId: ref.id } : {}),
    };
    // Remember the look so the next Reel starts with it.
    if (ref && brand.defaultReferenceId !== ref.id) await saveBrand({ ...brand, defaultReferenceId: ref.id });
    else if (!ref && isStyleId(body.style) && (brand.defaultStyle !== body.style || brand.defaultReferenceId)) {
      await saveBrand({ ...brand, defaultStyle: body.style, defaultReferenceId: undefined });
    }
    const now = new Date().toISOString();
    const reel: Reel = {
      id: nanoid(10),
      brandId: id,
      topic,
      script,
      mediaIds: (template === "meme" ? media.slice(0, 1) : media).map((m) => m.id),
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
