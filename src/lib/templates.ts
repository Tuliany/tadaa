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
  tips: {
    name: "Tips list",
    description: "Numbered tips or facts that position you as the expert.",
    scriptGuide: "Hook promising a number of tips, then 3-5 slides each starting with the tip number, then a call to action.",
    slideCount: "3-5 slides",
    mediaHint: "Optional background photos",
  },
};

/** Frame lengths for a Reel, adjusted for its look's pace (Quick Cuts is faster, Calm Luxury slower). */
export function timing(script: Pick<ReelScript, "style" | "styleOverrides">) {
  const pace = styleOf(script).pace;
  return {
    hook: Math.round(HOOK_FRAMES * Math.min(pace, 1.15)),
    slide: Math.round(SLIDE_FRAMES * pace),
    cta: Math.round(CTA_FRAMES * Math.min(Math.max(pace, 0.9), 1.15)),
  };
}

export const MEME_END_FRAMES = 45; // 1.5 s logo card
export const MEME_DEFAULT_SECONDS = 6;
export const MEME_MAX_SECONDS = 20;

/** Meme: how long the clip plays (from clipStart to clipEnd, capped). */
export function memeClipFrames(script: Pick<ReelScript, "slides">) {
  const s = script.slides[0];
  const start = s?.clipStart ?? 0;
  const len = s?.clipEnd != null && s.clipEnd > start ? s.clipEnd - start : MEME_DEFAULT_SECONDS;
  return Math.round(Math.min(Math.max(len, 1), MEME_MAX_SECONDS) * FPS);
}

export function reelDuration(script: Pick<ReelScript, "slides" | "style" | "styleOverrides" | "template">) {
  if (script.template === "meme") return memeClipFrames(script) + MEME_END_FRAMES;
  const t = timing(script);
  return t.hook + script.slides.length * t.slide + t.cta;
}
