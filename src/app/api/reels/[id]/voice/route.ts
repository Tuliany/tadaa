import { handle, HttpError, requireReel } from "@/lib/auth";
import { getMedia, saveReel } from "@/lib/db";
import { voiceEnabled, VoiceServiceError, listVoices } from "@/lib/elevenlabs";
import { writeVoiceover } from "@/lib/ai";
import { reelDuration, FPS } from "@/lib/templates";
import { editTranscript, getVoice, MAX_AI_CHARS, toTrack, VoiceError, voiceFromClip, voiceFromText, voiceFromUpload } from "@/lib/voice";
import type { Reel } from "@/lib/types";

export const maxDuration = 120;

const MAX_UPLOAD = 25 * 1024 * 1024;

/** AI voices per user per day (in memory; protects the voice credits). */
const aiUses = new Map<string, { day: string; n: number }>();
function spendAiVoice(userId: string) {
  const day = new Date().toISOString().slice(0, 10);
  const u = aiUses.get(userId);
  const n = u && u.day === day ? u.n : 0;
  if (n >= 40) throw new HttpError(429, "That's a lot of AI voices for one day. Try again tomorrow.");
  aiUses.set(userId, { day, n: n + 1 });
}

function friendly(e: unknown): never {
  if (e instanceof VoiceError || e instanceof VoiceServiceError) throw new HttpError(400, e.message);
  throw e;
}

async function withVoice(reel: Reel, voice: Reel["script"]["voice"]) {
  const next: Reel = { ...reel, script: { ...reel.script, voice }, status: "draft", renderFile: undefined, updatedAt: new Date().toISOString() };
  return saveReel(next);
}

/**
 * Add a voice to the Reel:
 * - multipart "file": a recording or an uploaded audio file (transcribed for captions)
 * - JSON { action: "ai", text, voiceId }: an AI voice reading the text
 * - JSON { action: "script" }: just write a voiceover text (nothing saved)
 * - JSON { action: "transcribe" }: Talking video, (re)transcribe the clip
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/voice">) => {
  const { reel, brand, user } = await requireReel((await ctx.params).id);
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Add a recording or an audio file.");
    if (file.size > MAX_UPLOAD) throw new HttpError(413, "That file is too big (max 25 MB).");
    try {
      const v = await voiceFromUpload(brand, Buffer.from(await file.arrayBuffer()), file.name || "recording.webm");
      return Response.json({ reel: await withVoice(reel, toTrack(v, reel.script.voice?.captions ?? true)), transcribed: v.words.length > 0 });
    } catch (e) {
      friendly(e);
    }
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string; text?: string; voiceId?: string };
  if (body.action === "script") {
    const seconds = Math.min(Math.max(reelDuration(reel.script) / FPS - 2, 8), 40);
    return Response.json({ text: await writeVoiceover(brand, reel.script, seconds) });
  }
  if (body.action === "ai") {
    if (!voiceEnabled()) throw new HttpError(400, "AI voices aren't switched on yet.");
    const text = String(body.text ?? "").trim().slice(0, MAX_AI_CHARS + 50);
    const chosen = (await listVoices().catch(() => [])).find((v) => v.id === body.voiceId);
    if (!chosen) throw new HttpError(400, "Pick a voice.");
    spendAiVoice(user.id);
    try {
      const v = await voiceFromText(brand, text, chosen);
      return Response.json({ reel: await withVoice(reel, toTrack(v, reel.script.voice?.captions ?? true)) });
    } catch (e) {
      friendly(e);
    }
  }
  if (body.action === "transcribe") {
    if (reel.script.template !== "talk") throw new HttpError(400, "Only talking videos are transcribed from the clip.");
    if (!voiceEnabled()) throw new HttpError(400, "Captions from speech aren't switched on yet.");
    const clip = reel.script.slides[0]?.mediaId ? await getMedia(reel.script.slides[0].mediaId) : null;
    if (!clip || clip.brandId !== brand.id) throw new HttpError(400, "The video is missing.");
    try {
      const v = await voiceFromClip(brand, clip);
      return Response.json({ reel: await withVoice(reel, toTrack(v, true)) });
    } catch (e) {
      friendly(e);
    }
  }
  throw new HttpError(400, "Unknown action");
});

/** Edit the transcript (captions) or turn captions on/off. */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/reels/[id]/voice">) => {
  const { reel } = await requireReel((await ctx.params).id);
  const track = reel.script.voice;
  if (!track) throw new HttpError(400, "This Reel has no voice.");
  const body = (await req.json().catch(() => ({}))) as { text?: string; captions?: boolean };
  let next = { ...track };
  if (typeof body.text === "string") {
    const stored = await getVoice(track.id);
    if (!stored || stored.brandId !== reel.brandId) throw new HttpError(404, "Voice not found");
    if (!stored.words.length) throw new HttpError(400, "There are no captions to edit.");
    const edited = await editTranscript(stored, body.text.slice(0, 5000));
    next = { ...next, text: edited.text, words: edited.words };
  }
  if (typeof body.captions === "boolean") next.captions = body.captions && next.words.length > 0;
  return Response.json(await withVoice(reel, next));
});

/** Remove the voiceover (Talking videos keep their own sound; this removes the captions). */
export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/voice">) => {
  const { reel } = await requireReel((await ctx.params).id);
  return Response.json(await withVoice(reel, undefined));
});

/** Is the voice service on, and which AI voices are there. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/reels/[id]/voice">) => {
  await requireReel((await ctx.params).id);
  if (!voiceEnabled()) return Response.json({ enabled: false, voices: [], maxChars: MAX_AI_CHARS });
  try {
    return Response.json({ enabled: true, voices: await listVoices(), maxChars: MAX_AI_CHARS });
  } catch (e) {
    return Response.json({ enabled: true, voices: [], maxChars: MAX_AI_CHARS, error: (e as Error).message });
  }
});
