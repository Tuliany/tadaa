import { nanoid } from "nanoid";
import { writeReelScript } from "./ai";
import { countReel, refundReel, saveBrand, saveReel } from "./db";
import { isStyleId, pickStyle } from "./styles";
import { isClipTemplate, MEME_MAX_SECONDS, TALK_MAX_SECONDS } from "./templates";
import { voiceEnabled } from "./elevenlabs";
import { toTrack, voiceFromClip } from "./voice";
import type { Brand, MediaItem, Reel, ReelScript, TemplateId, User } from "./types";

const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : undefined);

/** The owner's own caption, punchline and chosen moment win over what the AI wrote. */
function applyMeme(script: ReelScript, meme: MemeInput, clip: MediaItem) {
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

/** Talking video: the chosen part of the clip (up to a minute), always with its own sound. */
function applyTalk(script: ReelScript, meme: MemeInput, clip: MediaItem) {
  const m = clean(meme);
  const start = Math.min(m.clipStart ?? 0, Math.max(0, (clip.duration ?? Infinity) - 0.5));
  let end = m.clipEnd ?? (clip.duration ?? start + TALK_MAX_SECONDS);
  if (clip.duration) end = Math.min(end, clip.duration);
  if (end <= start) end = start + 1;
  script.slides = [{ text: "", mediaId: clip.id, clipStart: start, clipEnd: Math.min(end, start + TALK_MAX_SECONDS) }];
  script.sound = true;
}

export function clean(meme?: { caption?: string; punchline?: string; clipStart?: number; clipEnd?: number; sound?: boolean }) {
  return {
    caption: typeof meme?.caption === "string" ? meme.caption.trim().slice(0, 110) : "",
    punchline: typeof meme?.punchline === "string" ? meme.punchline.trim().slice(0, 50) : "",
    clipStart: num(meme?.clipStart),
    clipEnd: num(meme?.clipEnd),
    sound: meme?.sound,
  };
}


export type MemeInput = Parameters<typeof clean>[0];

export class ReelWriteError extends Error {}

/**
 * Writes and saves a new draft Reel. Counts it against the owner's plan first (throws PlanLimitError
 * when nothing is left) and gives it back if writing fails (then throws ReelWriteError).
 */
export async function createReel(opts: {
  brand: Brand;
  user: Pick<User, "id">;
  topic: string;
  template: TemplateId;
  media: MediaItem[];
  style?: string;
  referenceId?: string;
  meme?: MemeInput;
  /** Remember the chosen look on the brand (manual creation only). */
  rememberLook?: boolean;
}): Promise<Reel> {
  const { brand, user, topic, template, media } = opts;
  await countReel(user.id);
  try {
    // A look learned from a reference video, else a built-in look (else the brand's best match).
    const ref = opts.referenceId ? brand.references?.find((r) => r.id === opts.referenceId) : undefined;
    const style = ref ? ref.base : isStyleId(opts.style) ? opts.style : pickStyle(brand);
    const written = await writeReelScript(brand, topic, template, media.slice(0, isClipTemplate(template) ? 1 : undefined));
    if (template === "meme") applyMeme(written, opts.meme, media[0]);
    if (template === "talk") {
      applyTalk(written, opts.meme, media[0]);
      // Captions from what's said in the video.
      if (voiceEnabled()) {
        try {
          written.voice = toTrack(await voiceFromClip(brand, media[0]));
        } catch (e) {
          console.error("[reels] transcribing talking video", e);
        }
      }
    }
    const script = { ...written, style, ...(ref ? { styleOverrides: ref.overrides, referenceId: ref.id } : {}) };
    if (opts.rememberLook) {
      // Remember the look so the next Reel starts with it.
      if (ref && brand.defaultReferenceId !== ref.id) await saveBrand({ ...brand, defaultReferenceId: ref.id });
      else if (!ref && isStyleId(opts.style) && (brand.defaultStyle !== opts.style || brand.defaultReferenceId)) {
        await saveBrand({ ...brand, defaultStyle: opts.style, defaultReferenceId: undefined });
      }
    }
    const now = new Date().toISOString();
    const reel: Reel = {
      id: nanoid(10),
      brandId: brand.id,
      topic,
      script,
      mediaIds: (isClipTemplate(template) ? media.slice(0, 1) : media).map((m) => m.id),
      status: "draft",
      revisions: [],
      createdAt: now,
      updatedAt: now,
    };
    return await saveReel(reel);
  } catch (e) {
    await refundReel(user.id).catch(() => {});
    throw new ReelWriteError(`Could not write the Reel: ${(e as Error).message}`);
  }
}
