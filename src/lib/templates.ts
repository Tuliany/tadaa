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

export function reelDuration(script: Pick<ReelScript, "slides" | "style" | "styleOverrides">) {
  const t = timing(script);
  return t.hook + script.slides.length * t.slide + t.cta;
}
