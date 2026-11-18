import { styleOf } from "./styles";
import type { ReelScript, TemplateId } from "./types";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const HOOK_FRAMES = 60; // 2s
export const SLIDE_FRAMES = 78; // 2.6s
export const CTA_FRAMES = 75; // 2.5s

export const TEMPLATES: Record<
  TemplateId,
  { name: string; description: string; scriptGuide: string; slideCount: string; mediaHint: string }
> = {
  showcase: {
    name: "Showcase",
    description: "Highlight a product, service or place with your photos and punchy text.",
    scriptGuide: "Hook, then 3-4 slides each pairing one photo or clip with one benefit, then a call to action.",
    slideCount: "3-4 slides",
    mediaHint: "3-5 photos or short clips",
  },
  beforeAfter: {
    name: "Before & After",
    description: "Reveal a transformation with a wipe from before to after.",
    scriptGuide:
      "Hook that teases the result. Slide 1 is the BEFORE (mediaIndex 0), slide 2 is the AFTER (mediaIndex 1), optional slide 3 explains what was done. Then a call to action.",
    slideCount: "2-3 slides",
    mediaHint: "One before photo, then one after photo",
  },
  meme: {
    name: "Meme",
    description: "Your clip with a funny caption on top – the classic social meme, about your business.",
    scriptGuide:
      "A meme: the hook is the top caption (the relatable setup, max 90 characters, e.g. 'When the client asks if it can be ready by Monday'). Exactly 1 slide using mediaIndex 0, whose text is an optional short punchline shown at the end (max 40 characters, may be empty). Keep it light, self-aware and on-brand; never mock customers.",
    slideCount: "1 slide (the clip)",
    mediaHint: "One short video clip (your own, or a licence-free stock clip)",
  },
  talk: {
    name: "Talking video",
    description: "You or your team talking to the camera, with captions that follow every word.",
    scriptGuide:
      "A talking-to-camera video: the person's own words are the content (captions are added from the speech automatically). The hook is a short title shown at the top during the first seconds (max 7 words). Exactly 1 slide using mediaIndex 0 with empty text. Then a call to action for the end card.",
    slideCount: "1 slide (the video)",
    mediaHint: "One video of someone talking (up to 60 seconds)",
  },
  tips: {
    name: "Tips list",
    description: "Numbered tips or facts that position you as the expert.",
    scriptGuide: "Hook promising a number of tips, then 3-5 slides each starting with the tip number, then a call to action.",
    slideCount: "3-5 slides",
    mediaHint: "Optional background photos",
  },
};

/** Frame lengths for a Reel, adjusted for its look's pace (Quick Cuts is faster, Calm Luxury slower).
 * With a voiceover, the slides stretch so the Reel lasts as long as the voice. */
export function timing(script: Pick<ReelScript, "style" | "styleOverrides"> & Partial<Pick<ReelScript, "slides" | "voice" | "template">>) {
  const pace = styleOf(script).pace;
  const t = {
    hook: Math.round(HOOK_FRAMES * Math.min(pace, 1.15)),
    slide: Math.round(SLIDE_FRAMES * pace),
    cta: Math.round(CTA_FRAMES * Math.min(Math.max(pace, 0.9), 1.15)),
  };
  const v = script.voice;
  if (v && v.source !== "clip" && v.duration > 0 && script.slides?.length) {
    const n = script.slides.length;
    // The voice plays from the start; the end card may overlap its last words.
    const total = Math.max(t.hook + n * t.slide + t.cta, Math.ceil((v.duration + 0.7) * FPS) + Math.round(t.cta * 0.4));
    t.slide = Math.ceil((total - t.hook - t.cta) / n);
  }
  return t;
}

export const MEME_END_FRAMES = 45; // 1.5 s logo card
export const MEME_DEFAULT_SECONDS = 6;
export const MEME_MAX_SECONDS = 20;
/** Talking video: longest part of the clip used. */
export const TALK_MAX_SECONDS = 60;

/** Formats built around one clip (Meme, Talking video). */
export const isClipTemplate = (t: TemplateId) => t === "meme" || t === "talk";
export const maxClipSeconds = (t: TemplateId) => (t === "talk" ? TALK_MAX_SECONDS : MEME_MAX_SECONDS);

/** Meme / Talking video: how long the clip plays (from clipStart to clipEnd, capped). */
export function memeClipFrames(script: Pick<ReelScript, "slides"> & Partial<Pick<ReelScript, "template" | "voice">>) {
  const s = script.slides[0];
  const start = s?.clipStart ?? 0;
  const fallback = script.template === "talk" ? (script.voice?.duration ?? 15) - start : MEME_DEFAULT_SECONDS;
  const len = s?.clipEnd != null && s.clipEnd > start ? s.clipEnd - start : fallback;
  return Math.round(Math.min(Math.max(len, 1), maxClipSeconds(script.template ?? "meme")) * FPS);
}

export function reelDuration(script: Pick<ReelScript, "slides" | "style" | "styleOverrides" | "template" | "voice">) {
  if (isClipTemplate(script.template)) return memeClipFrames(script) + MEME_END_FRAMES;
  const t = timing(script);
  return t.hook + script.slides.length * t.slide + t.cta;
}

/** Moments a sound effect can be placed at, with labels, for this Reel. */
export function soundMoments(script: Pick<ReelScript, "slides" | "style" | "styleOverrides" | "template" | "voice">): { at: string; label: string; frame: number }[] {
  if (script.template === "talk") {
    return [
      { at: "start", label: "Start", frame: 0 },
      { at: "end", label: "End card", frame: memeClipFrames(script) },
    ];
  }
  if (script.template === "meme") {
    const clip = memeClipFrames(script);
    return [
      { at: "start", label: "Start", frame: 0 },
      { at: "punch", label: "Punchline", frame: Math.max(0, clip - 40) },
      { at: "end", label: "End card", frame: clip },
    ];
  }
  const t = timing(script);
  return [
    { at: "hook", label: "Opening", frame: 0 },
    ...script.slides.map((_, i) => ({ at: `s${i}`, label: `Slide ${i + 1}`, frame: t.hook + i * t.slide })),
    { at: "cta", label: "End card", frame: t.hook + script.slides.length * t.slide },
  ];
}
