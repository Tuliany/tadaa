import { isStyleId } from "@/lib/styles";
import { handle, requireReel } from "@/lib/auth";
import { getBrand } from "@/lib/db";
import { saveReel } from "@/lib/db";
import { getStoredSound, strip } from "@/lib/sounds";
import { soundMoments } from "@/lib/templates";
import type { Reel, ReelScript } from "@/lib/types";

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

  if (body.script?.slides) {
    const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 && v < 3600 ? Math.round(v * 10) / 10 : undefined);
    body.script.slides = body.script.slides.slice(0, 8).map((x) => ({
      text: String(x.text ?? "").slice(0, 200),
      mediaId: typeof x.mediaId === "string" ? x.mediaId : undefined,
      clipStart: n(x.clipStart),
      clipEnd: n(x.clipEnd),
    }));
  }
  if (body.script && "sound" in body.script) body.script.sound = !!body.script.sound;

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
    if (body.script.style !== undefined && !isStyleId(body.script.style)) next.script.style = reel.script.style;
    next.status = "draft";
    next.renderFile = undefined;
  }
  await saveReel(next);
  return Response.json(next);
});
