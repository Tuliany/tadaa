import { isStyleId } from "@/lib/styles";
import { handle, HttpError, requireReel } from "@/lib/auth";
import { getBrand, listMedia } from "@/lib/db";
import { saveReel } from "@/lib/db";
import { getStoredSound, strip } from "@/lib/sounds";
import { cleanTitleStyle } from "@/lib/styles";
import { soundMoments } from "@/lib/templates";
import type { Reel, ReelScript } from "@/lib/types";

/** A text position (centre, fractions of the frame), kept inside the frame; anything else is dropped. */
function cleanPos(p: unknown): { x: number; y: number } | undefined {
  if (!p || typeof p !== "object") return undefined;
  const { x, y } = p as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) return undefined;
  const r = (v: number, lo: number, hi: number) => Math.round(Math.min(Math.max(v, lo), hi) * 1000) / 1000;
  return { x: r(x, 0.1, 0.9), y: r(y, 0.05, 0.95) };
}

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]">) => {
  const { reel } = await requireReel((await ctx.params).id);
  return Response.json(reel);
});

/** Approve / un-approve, or save manual text edits to the script. */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]">) => {
  const { reel } = await requireReel((await ctx.params).id);
  const body = (await req.json()) as { status?: Reel["status"]; script?: Partial<ReelScript> };
  if (body.script) {
    // Look tweaks only ever come from the brand's saved references, never straight from the client.
    // Voices are only set through /voice (recorded, AI or transcribed on the server).
    const { styleOverrides: _ignored, referenceId, voice: _voice, ...rest } = body.script;
    void _ignored;
    void _voice;
    body.script = rest;
    if (referenceId) {
      const ref = (await getBrand(reel.brandId))?.references?.find((r) => r.id === referenceId);
      if (ref) body.script = { ...rest, style: ref.base, styleOverrides: ref.overrides, referenceId: ref.id };
    } else if (rest.style !== undefined) {
      body.script = { ...rest, styleOverrides: undefined, referenceId: undefined };
    }
  }

  let slideMedia: string[] = [];
  if (body.script?.slides) {
    if (!Array.isArray(body.script.slides) || !body.script.slides.length) throw new HttpError(400, "A Reel needs at least one slide.");
    const t = reel.script.template;
    if (t === "beforeAfter" && body.script.slides.length !== 2) throw new HttpError(400, "Before & After always has two slides.");
    if ((t === "meme" || t === "talk") && body.script.slides.length !== 1) throw new HttpError(400, "This format has one clip.");
    // Slides may only show the brand's own photos and clips.
    const own = new Set((await listMedia(reel.brandId)).map((m) => m.id));
    const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 && v < 3600 ? Math.round(v * 10) / 10 : undefined);
    body.script.slides = body.script.slides.slice(0, 8).map((x) => ({
      text: String(x.text ?? "").slice(0, 200),
      mediaId: typeof x.mediaId === "string" && own.has(x.mediaId) ? x.mediaId : undefined,
      clipStart: n(x.clipStart),
      clipEnd: n(x.clipEnd),
      pos: cleanPos(x.pos),
    }));
    slideMedia = body.script.slides.map((x) => x.mediaId).filter((x): x is string => !!x);
  }
  if (body.script && "textPos" in body.script) {
    const t = body.script.textPos as Record<string, unknown> | null | undefined;
    const hook = cleanPos(t?.hook);
    const cta = cleanPos(t?.cta);
    body.script.textPos = hook || cta ? { ...(hook ? { hook } : {}), ...(cta ? { cta } : {}) } : undefined;
  }
  if (body.script && "watermarkPos" in body.script) {
    const p = body.script.watermarkPos as { x?: unknown; y?: unknown } | null | undefined;
    const c = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.min(Math.max(v, 0.08), 0.92) : null);
    const x = c(p?.x);
    const y = c(p?.y);
    body.script.watermarkPos = x !== null && y !== null ? { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } : undefined;
  }
  if (body.script && "sound" in body.script) body.script.sound = !!body.script.sound;

  if (body.script && "titleStyle" in body.script) body.script.titleStyle = cleanTitleStyle(body.script.titleStyle);

  // Music and sound effects: only sounds imported into Tadaa (CC0); details come from our records.
  const vol = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(Math.max(v, 0), 1) : d);
  if (body.script && "music" in body.script) {
    const m = body.script.music;
    const stored = m?.id ? await getStoredSound(m.id) : null;
    body.script.music = stored ? { ...strip(stored), volume: vol(m?.volume, 0.35) } : undefined;
  }
  if (body.script && "effects" in body.script) {
    const valid = new Set(soundMoments({ ...reel.script, ...body.script, template: reel.script.template }).map((x) => x.at));
    const out: NonNullable<ReelScript["effects"]> = [];
    for (const e of (Array.isArray(body.script.effects) ? body.script.effects : []).slice(0, 12)) {
      const stored = e?.sound?.id ? await getStoredSound(e.sound.id) : null;
      if (stored && valid.has(String(e.at)) && !out.some((x) => x.at === e.at)) out.push({ at: String(e.at), sound: strip(stored), volume: vol(e.volume, 0.9) });
    }
    body.script.effects = out;
  }

  const next: Reel = { ...reel, updatedAt: new Date().toISOString() };
  if (body.status === "approved" || body.status === "draft") next.status = body.status;
  if (body.script) {
    next.script = { ...reel.script, ...body.script, template: reel.script.template };
    if (slideMedia.length) next.mediaIds = [...new Set([...slideMedia, ...reel.mediaIds])];
    if (body.script.style !== undefined && !isStyleId(body.script.style)) next.script.style = reel.script.style;
    next.status = "draft";
    next.renderFile = undefined;
  }
  await saveReel(next);
  return Response.json(next);
});
