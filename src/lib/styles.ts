import type { Brand, ReelScript } from "./types";

/**
 * Looks ("styles") are visual skins that work with every format (Showcase, Before & After, Tips):
 * font, where the text sits and how it's shown, pace, transitions, camera motion and colour grade.
 */
export type StyleId = "bold" | "quickcuts" | "luxury" | "listing" | "minimal" | "captions" | "magazine" | "warm";

export interface StyleSpec {
  name: string;
  tagline: string;
  /** Industries this look suits – used to pick a default for a brand. */
  keywords: string[];
  font: "inter" | "playfair" | "bebas" | "nunito" | "montserrat" | "dmSerif";
  weight: number;
  upper: boolean;
  letterSpacing: number;
  /** Size multiplier for slide text. */
  size: number;
  placement: "center" | "bottom" | "top" | "lowerThird";
  /** shadow: white on the photo · pill: brand-colour pill · box: solid box · outline: captions · bar: lower-third card · tilt: sticker */
  treatment: "shadow" | "pill" | "box" | "outline" | "bar" | "tilt";
  /** Seconds per slide relative to normal (0.7 = faster). */
  pace: number;
  transition: "pop" | "cut" | "fade" | "slide" | "zoom";
  /** Ken Burns amount: 0 = still, 0.1 = normal. */
  motion: number;
  shade: number;
  /** CSS filter for the colour grade. */
  grade?: string;
  letterbox?: boolean;
  /** Photo inset on a clean background instead of full-bleed. */
  framed?: boolean;
  wordByWord?: boolean;
}

export const STYLES: Record<StyleId, StyleSpec> = {
  bold: {
    name: "Bold Pop",
    tagline: "Punchy text on colour pills. Works for anything.",
    keywords: [],
    font: "inter",
    weight: 800,
    upper: false,
    letterSpacing: -1,
    size: 1,
    placement: "bottom",
    treatment: "pill",
    pace: 1,
    transition: "pop",
    motion: 0.1,
    shade: 0.5,
  },
  quickcuts: {
    name: "Quick Cuts",
    tagline: "Fast, loud and high energy.",
    keywords: ["fitness", "gym", "sport", "training", "event", "music", "club", "auto", "car", "construction", "trade", "barber"],
    font: "bebas",
    weight: 400,
    upper: true,
    letterSpacing: 2,
    size: 1.35,
    placement: "center",
    treatment: "box",
    pace: 0.7,
    transition: "zoom",
    motion: 0.16,
    shade: 0.55,
    grade: "contrast(1.12) saturate(1.15)",
  },
  luxury: {
    name: "Calm Luxury",
    tagline: "Slow, cinematic and refined.",
    keywords: ["luxury", "villa", "hotel", "spa", "jewel", "wine", "yacht", "premium", "boutique", "estate", "resort"],
    font: "playfair",
    weight: 600,
    upper: false,
    letterSpacing: 0,
    size: 1.05,
    placement: "lowerThird",
    treatment: "shadow",
    pace: 1.35,
    transition: "fade",
    motion: 0.07,
    shade: 0.55,
    grade: "contrast(1.05) saturate(0.85) sepia(0.08)",
    letterbox: true,
  },
  listing: {
    name: "Listing Tour",
    tagline: "Room-by-room tour with clean info cards.",
    keywords: ["real estate", "property", "housing", "apartment", "rental", "realtor", "broker", "home", "interior", "architecture", "accommodation"],
    font: "montserrat",
    weight: 800,
    upper: false,
    letterSpacing: -0.5,
    size: 0.8,
    placement: "lowerThird",
    treatment: "bar",
    pace: 1.15,
    transition: "slide",
    motion: 0.08,
    shade: 0.35,
  },
  minimal: {
    name: "Clean Minimal",
    tagline: "Calm, framed photos and crisp text. Great for B2B.",
    keywords: ["consult", "software", "saas", "agency", "b2b", "law", "account", "finance", "clinic", "dental", "medical", "service"],
    font: "inter",
    weight: 800,
    upper: false,
    letterSpacing: -1.5,
    size: 0.9,
    placement: "top",
    treatment: "shadow",
    pace: 1.1,
    transition: "fade",
    motion: 0.05,
    shade: 0,
    framed: true,
  },
  captions: {
    name: "Creator Captions",
    tagline: "Native social look with word-by-word captions.",
    keywords: ["coach", "creator", "course", "podcast", "personal", "education", "tutor", "influencer"],
    font: "montserrat",
    weight: 800,
    upper: true,
    letterSpacing: 0,
    size: 1.25,
    placement: "center",
    treatment: "outline",
    pace: 1,
    transition: "cut",
    motion: 0.12,
    shade: 0.25,
    wordByWord: true,
  },
  magazine: {
    name: "Magazine",
    tagline: "Editorial serif headlines, like a cover story.",
    keywords: ["fashion", "design", "beauty", "salon", "art", "gallery", "photography", "decor", "florist", "bridal"],
    font: "dmSerif",
    weight: 400,
    upper: false,
    letterSpacing: -1,
    size: 1.15,
    placement: "top",
    treatment: "shadow",
    pace: 1.15,
    transition: "slide",
    motion: 0.08,
    shade: 0.45,
    grade: "contrast(1.08) saturate(0.95)",
  },
  warm: {
    name: "Warm & Friendly",
    tagline: "Rounded, cosy and playful sticker labels.",
    keywords: ["cafe", "café", "coffee", "bakery", "restaurant", "food", "kids", "family", "pet", "local", "shop", "ice cream", "brunch"],
    font: "nunito",
    weight: 900,
    upper: false,
    letterSpacing: -0.5,
    size: 0.95,
    placement: "bottom",
    treatment: "tilt",
    pace: 1,
    transition: "pop",
    motion: 0.1,
    shade: 0.4,
    grade: "saturate(1.1) sepia(0.12) brightness(1.03)",
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

/** The parts of a look a reference video may change. */
export type StyleOverrides = Partial<
  Pick<StyleSpec, "font" | "weight" | "upper" | "size" | "placement" | "treatment" | "pace" | "transition" | "motion" | "shade" | "grade" | "letterbox" | "wordByWord">
>;

const FONT_KEYS = ["inter", "playfair", "bebas", "nunito", "montserrat", "dmSerif"] as const;

/** Keep only known keys with sane values (overrides are stored and rendered, so never trust them blindly). */
export function cleanOverrides(o: unknown): StyleOverrides {
  if (!o || typeof o !== "object") return {};
  const x = o as Record<string, unknown>;
  const out: StyleOverrides = {};
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);
  out.font = pick(x.font, FONT_KEYS);
  out.weight = num(x.weight, 300, 900);
  out.upper = typeof x.upper === "boolean" ? x.upper : undefined;
  out.size = num(x.size, 0.7, 1.5);
  out.placement = pick(x.placement, ["center", "bottom", "top", "lowerThird"] as const);
  out.treatment = pick(x.treatment, ["shadow", "pill", "box", "outline", "bar", "tilt"] as const);
  out.pace = num(x.pace, 0.45, 1.6);
  out.transition = pick(x.transition, ["pop", "cut", "fade", "slide", "zoom"] as const);
  out.motion = num(x.motion, 0, 0.2);
  out.shade = num(x.shade, 0, 0.8);
  out.grade = typeof x.grade === "string" && /^[a-z0-9().,\s-]{0,120}$/i.test(x.grade) ? x.grade : undefined;
  out.letterbox = typeof x.letterbox === "boolean" ? x.letterbox : undefined;
  out.wordByWord = typeof x.wordByWord === "boolean" ? x.wordByWord : undefined;
  for (const k of Object.keys(out) as (keyof StyleOverrides)[]) if (out[k] === undefined) delete out[k];
  return out;
}

export function isStyleId(x: unknown): x is StyleId {
  return typeof x === "string" && x in STYLES;
}

/** Best-matching look for a brand: its last choice, else by industry and description, else Bold Pop. */
export function pickStyle(brand: Pick<Brand, "industry" | "description" | "offers"> & { defaultStyle?: StyleId }): StyleId {
  if (brand.defaultStyle && isStyleId(brand.defaultStyle)) return brand.defaultStyle;
  const text = `${brand.industry} ${brand.description} ${brand.offers.join(" ")}`.toLowerCase();
  let best: StyleId = "bold";
  let score = 0;
  for (const id of STYLE_IDS) {
    const s = STYLES[id].keywords.reduce((n, k) => n + (text.includes(k) ? (k.length > 5 ? 2 : 1) : 0), 0);
    if (s > score) {
      best = id;
      score = s;
    }
  }
  return best;
}

export function styleOf(script: Pick<ReelScript, "style" | "styleOverrides">): StyleSpec {
  const base = STYLES[script.style && isStyleId(script.style) ? script.style : "bold"];
  return script.styleOverrides ? { ...base, ...cleanOverrides(script.styleOverrides) } : base;
}
