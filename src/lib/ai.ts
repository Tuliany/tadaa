import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { SiteInfo } from "./scrape";
import { LANGUAGES, type Brand, type Language, type MediaItem, type PlanIdea, type ReelScript, type TemplateId } from "./types";
import { TEMPLATES } from "./templates";
import { cleanOverrides, STYLE_IDS, STYLES, type StyleId, type StyleOverrides } from "./styles";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/** Ask Claude for JSON and validate it. Retries once if the shape is wrong. */
async function askJson<T>(system: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: system + "\n\nRespond with a single JSON object only. No markdown fences, no commentary.",
      messages: [
        {
          role: "user",
          content: attempt === 0 ? prompt : `${prompt}\n\nYour previous answer was invalid: ${lastError}. Return valid JSON matching the schema.`,
        },
      ],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    try {
      const parsed = schema.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.message.slice(0, 500);
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`AI returned invalid data: ${lastError}`);
}

/**
 * Best-effort parse of an unfinished JSON object (closes open strings/brackets, drops a dangling key),
 * so the UI can show fields while the AI is still writing.
 */
export function parsePartialJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let src = text.slice(start);
  for (let attempt = 0; attempt < 60 && src.length > 1; attempt++) {
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (const ch of src) {
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
    let fixed = src;
    if (inStr) fixed += esc ? '\\"' : '"';
    fixed = fixed.replace(/[,:\s]+$/, "");
    fixed += stack.reverse().join("");
    try {
      const v = JSON.parse(fixed);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      // Drop the last partial token (e.g. a key without a value, half a number or literal) and try again.
      const cut = Math.max(src.lastIndexOf(","), src.lastIndexOf("{"), src.lastIndexOf("["));
      if (cut <= 0) return null;
      src = src[cut] === "," ? src.slice(0, cut) : src.slice(0, cut + 1);
    }
  }
  return null;
}

export type OnPartial = (partial: Record<string, unknown>) => void;

/** Like askJson, but streams: calls onPartial with the object-so-far as the AI writes it. */
async function streamJson<T>(system: string, prompt: string, schema: z.ZodType<T>, onPartial: OnPartial): Promise<T> {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 2000,
    system: system + "\n\nRespond with a single JSON object only. No markdown fences, no commentary.",
    messages: [{ role: "user", content: prompt }],
  });
  let text = "";
  let last = 0;
  stream.on("text", (delta) => {
    text += delta;
    const now = Date.now();
    if (now - last < 120) return;
    last = now;
    const p = parsePartialJson(text);
    if (p) onPartial(p);
  });
  await stream.finalMessage();
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    if (parsed.success) return parsed.data;
  } catch {}
  // Rare: the streamed answer didn't validate – fall back to the (retrying) non-streamed path.
  return askJson(system, prompt, schema);
}

// ---------- Brand profile ----------

const brandSchema = z.object({
  name: z.string(),
  industry: z.string(),
  description: z.string(),
  audience: z.string(),
  voice: z.string(),
  offers: z.array(z.string()).max(8),
  claimsToAvoid: z.array(z.string()).max(8),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    text: z.string(),
    background: z.string(),
  }),
});

export type BrandDraft = z.infer<typeof brandSchema>;

export async function buildBrandProfile(
  site: SiteInfo | null,
  opts: { name?: string; language: Language; notes?: string },
  onPartial?: OnPartial,
): Promise<BrandDraft> {
  if (!aiEnabled()) return mockBrand(site, opts);
  return (onPartial ? (s: string, p: string, sc: typeof brandSchema) => streamJson(s, p, sc, onPartial) : askJson)(
    "You are a brand strategist building a brand profile that an automated short-video tool will follow. Be concrete and faithful to the source; never invent prices, awards or guarantees.",
    `Build a brand profile from this business information.

Business name (if given): ${opts.name || "(infer from the website)"}
Extra notes from the owner: ${opts.notes || "(none)"}
Website title: ${site?.title || "-"}
Website description: ${site?.description || "-"}
Colours found on the website (most used first): ${site?.colors.join(", ") || "(none)"}
Website text:
"""
${site?.text || "(no website provided)"}
"""

Write the text fields in ${LANGUAGES[opts.language]}.
Schema:
{
  "name": string,
  "industry": string (2-4 words),
  "description": string (1-2 sentences),
  "audience": string (who buys, 1 sentence),
  "voice": string (tone of voice in 3-6 words, e.g. "warm, direct, a little playful"),
  "offers": string[] (main products/services, max 6),
  "claimsToAvoid": string[] (things content must never claim, e.g. unverified prices or guarantees; max 5),
  "colors": { "primary": hex, "secondary": hex, "text": hex, "background": hex } (use the website colours when available; text must be readable on background)
}`,
    brandSchema,
  );
}

function mockBrand(site: SiteInfo | null, opts: { name?: string; language: Language }): BrandDraft {
  const name = opts.name || site?.siteName || "My Business";
  const [primary = "#ff5a5f", secondary = "#ffb400"] = site?.colors ?? [];
  return {
    name,
    industry: "Local business",
    description: site?.description || `${name} serves local customers with care and quality.`,
    audience: "Local customers looking for a reliable, friendly business.",
    voice: "warm, clear, confident",
    offers: site?.text
      ? site.text.split("\n").filter((l) => l.length > 3 && l.length < 40).slice(0, 4)
      : ["Our main service"],
    claimsToAvoid: ["Prices that are not on the website", "Guarantees or medical claims"],
    colors: { primary, secondary, text: "#ffffff", background: "#111111" },
  };
}

// ---------- Reel scripts ----------

const scriptSchema = z.object({
  hook: z.string().max(90),
  slides: z
    .array(z.object({ text: z.string().max(110), mediaIndex: z.number().int().nullable().optional() }))
    .min(2)
    .max(6),
  cta: z.string().max(60),
  caption: z.string().max(1200),
  hashtags: z.array(z.string()).max(10),
});

function brandBrief(brand: Brand) {
  return `Brand: ${brand.name}
Industry: ${brand.industry}
About: ${brand.description}
Audience: ${brand.audience}
Voice: ${brand.voice}
Offers: ${brand.offers.join("; ")}
Never claim: ${brand.claimsToAvoid.join("; ") || "-"}
Language for all text: ${LANGUAGES[brand.language]}`;
}

function toScript(template: TemplateId, raw: z.infer<typeof scriptSchema>, media: MediaItem[]): ReelScript {
  return {
    template,
    hook: raw.hook,
    slides: raw.slides.map((s, i) => {
      const idx = s.mediaIndex ?? (media.length ? i % media.length : null);
      return { text: s.text, mediaId: idx != null && media[idx] ? media[idx].id : undefined };
    }),
    cta: raw.cta,
    caption: raw.caption,
    hashtags: raw.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
  };
}

export async function writeReelScript(brand: Brand, topic: string, template: TemplateId, media: MediaItem[]): Promise<ReelScript> {
  if (!aiEnabled()) return mockScript(brand, topic, template, media);
  const t = TEMPLATES[template];
  const raw = await askJson(
    "You write scripts for short vertical social videos (Instagram Reels, TikTok) for small businesses. Hooks stop the scroll in under 2 seconds. On-screen text is short and punchy. Stay strictly within the brand facts given.",
    `${brandBrief(brand)}

Template: ${t.name} – ${t.scriptGuide}
Topic for this Reel: ${topic}
Media available (by index): ${media.length ? media.map((m, i) => `${i}: ${m.kind} "${m.fileName}"`).join(", ") : "none – slides will use brand colours as background"}

Schema:
{
  "hook": string (max 8 words, on screen for 2 seconds),
  "slides": [{ "text": string (max 14 words), "mediaIndex": number | null }] (${t.slideCount}),
  "cta": string (max 6 words, end card),
  "caption": string (Instagram caption, 2-4 short lines, may use 1-2 emojis),
  "hashtags": string[] (5-8 relevant hashtags)
}`,
    scriptSchema,
  );
  return toScript(template, raw, media);
}

export async function reviseReelScript(brand: Brand, script: ReelScript, request: string, media: MediaItem[]): Promise<ReelScript> {
  if (!aiEnabled()) {
    return { ...script, caption: `${script.caption}\n\n(Demo mode: change requested – "${request}". Add an Anthropic API key to apply edits automatically.)` };
  }
  const raw = await askJson(
    "You revise short-video scripts for small businesses. Apply the owner's requested change precisely and keep everything else the same unless the request implies otherwise.",
    `${brandBrief(brand)}

Current script (mediaIndex refers to the media list below):
${JSON.stringify({
  hook: script.hook,
  slides: script.slides.map((s) => ({ text: s.text, mediaIndex: s.mediaId ? media.findIndex((m) => m.id === s.mediaId) : null })),
  cta: script.cta,
  caption: script.caption,
  hashtags: script.hashtags,
})}
Media: ${media.map((m, i) => `${i}: ${m.kind} "${m.fileName}"`).join(", ") || "none"}

Owner's change request: "${request}"

Return the full revised script with the same schema. Keep the length limits: hook max 8 words, slides max 14 words, CTA max 6 words.`,
    scriptSchema,
  );
  return { ...toScript(script.template, raw, media), style: script.style };
}

function mockScript(brand: Brand, topic: string, template: TemplateId, media: MediaItem[]): ReelScript {
  const offers = brand.offers.length ? brand.offers : [brand.name];
  const slidesByTemplate: Record<TemplateId, string[]> = {
    showcase: [`This is ${brand.name}`, topic, `Made for ${brand.audience.toLowerCase().replace(/\.$/, "")}`],
    beforeAfter: ["Before…", "…and after", `That's the ${brand.name} difference`],
    tips: offers.slice(0, 3).map((o, i) => `${i + 1}. ${o}`),
  };
  const slides = slidesByTemplate[template].map((text, i) => ({
    text,
    mediaId: media.length ? media[i % media.length].id : undefined,
  }));
  return {
    template,
    hook: template === "beforeAfter" ? "Wait for the after 👀" : template === "tips" ? `3 things to know about ${topic}` : `You need to see this`,
    slides,
    cta: "Follow for more",
    caption: `${topic} ✨\n${brand.description}`,
    hashtags: ["#smallbusiness", "#local", `#${brand.name.normalize("NFD").replace(/[^a-z0-9]/gi, "").toLowerCase()}`],
  };
}

// ---------- Weekly content plan ----------

const planSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string(),
        template: z.enum(["showcase", "beforeAfter", "tips"]),
        hook: z.string(),
        needsMedia: z.string(),
      }),
    )
    .min(3)
    .max(10),
});

export async function generatePlan(brand: Brand, onPartial?: OnPartial): Promise<PlanIdea[]> {
  if (!aiEnabled()) {
    return [
      { title: "Meet the business", template: "showcase", hook: `Behind the scenes at ${brand.name}`, needsMedia: "3-5 photos of your space and team" },
      { title: "Transformation", template: "beforeAfter", hook: "Wait for the after 👀", needsMedia: "One before and one after photo" },
      { title: "Customer tips", template: "tips", hook: "3 things our customers always ask", needsMedia: "Any 3 photos" },
      { title: "Best seller", template: "showcase", hook: "Our most popular pick", needsMedia: "2-3 photos of your best product or service" },
      { title: "Myth vs fact", template: "tips", hook: "Stop believing this", needsMedia: "Optional" },
    ];
  }
  const ask = onPartial ? (s: string, p: string, sc: typeof planSchema) => streamJson(s, p, sc, onPartial) : askJson;
  const res = await ask(
    "You plan a week of short-video content for a small business. Ideas must be easy to film on a phone in a few minutes.",
    `${brandBrief(brand)}

Plan 7 Reel ideas for the coming week, mixing templates: showcase (product/service highlight), beforeAfter (transformation), tips (numbered tips list).
Schema: { "ideas": [{ "title": string, "template": "showcase"|"beforeAfter"|"tips", "hook": string (max 8 words), "needsMedia": string (what to film or photograph) }] }`,
    planSchema,
  );
  return res.ideas;
}

// ---------- Reference videos ----------

const referenceSchema = z.object({
  name: z.string(),
  summary: z.string(),
  closestStyle: z.string(),
  font: z.enum(["sans", "condensed", "serif", "rounded", "display-serif", "geometric"]),
  uppercase: z.boolean(),
  textSize: z.enum(["small", "medium", "large"]),
  placement: z.enum(["center", "bottom", "top", "lowerThird"]),
  treatment: z.enum(["shadow", "pill", "box", "outline", "bar", "tilt"]),
  transition: z.enum(["cut", "fade", "slide", "zoom", "pop"]),
  colorGrade: z.enum(["neutral", "warm", "cool", "high-contrast", "muted", "black-and-white"]),
  letterbox: z.boolean(),
  wordByWord: z.boolean(),
  motion: z.enum(["still", "gentle", "strong"]),
});

const FONT_MAP = {
  sans: { font: "inter", weight: 800 },
  condensed: { font: "bebas", weight: 400 },
  serif: { font: "playfair", weight: 600 },
  rounded: { font: "nunito", weight: 900 },
  "display-serif": { font: "dmSerif", weight: 400 },
  geometric: { font: "montserrat", weight: 800 },
} as const;

const GRADES: Record<string, string | undefined> = {
  neutral: "none",
  warm: "saturate(1.1) sepia(0.12) brightness(1.03)",
  cool: "saturate(0.95) hue-rotate(-8deg) brightness(1.02)",
  "high-contrast": "contrast(1.18) saturate(1.15)",
  muted: "saturate(0.75) contrast(0.98)",
  "black-and-white": "grayscale(1) contrast(1.1)",
};

/** Reads frames of a reference video and returns the closest look plus tweaks to match its edit. */
export async function describeReference(
  frames: Buffer[],
  facts: { duration: number; avgShotSeconds: number | null; cuts: number },
  language: Language,
): Promise<{ name: string; summary: string; base: StyleId; overrides: StyleOverrides }> {
  const pace = facts.avgShotSeconds ? Math.min(1.6, Math.max(0.45, facts.avgShotSeconds / 2.6)) : 1;
  if (!aiEnabled()) {
    return { name: "My reference", summary: "Pacing copied from your video.", base: "bold", overrides: cleanOverrides({ pace }) };
  }
  const styleList = STYLE_IDS.map((id) => `${id}: ${STYLES[id].name} – ${STYLES[id].tagline}`).join("\n");
  const prompt = `These are ${frames.length} frames, in order, from a short vertical video (${facts.duration.toFixed(1)} s, ${facts.cuts} cuts${
    facts.avgShotSeconds ? `, about ${facts.avgShotSeconds} s per shot` : ", one continuous shot"
  }). Describe its EDITING STYLE (not its subject) so we can recreate the look for a different business with their own photos.

Our looks:
${styleList}

Return JSON:
{
  "name": string (2-3 words naming the look, e.g. "Snappy captions"),
  "summary": string (one short sentence for the user in ${LANGUAGES[language]}, e.g. "Fast cuts, bold white captions in the middle, warm colours"),
  "closestStyle": one of ${STYLE_IDS.map((s) => `"${s}"`).join(", ")},
  "font": "sans" | "condensed" | "serif" | "rounded" | "display-serif" | "geometric" (the on-screen text font; "sans" if there is no text),
  "uppercase": boolean,
  "textSize": "small" | "medium" | "large",
  "placement": "center" | "bottom" | "top" | "lowerThird",
  "treatment": "shadow" (plain text on the image) | "pill" (rounded colour background) | "box" (solid black/white box) | "outline" (subtitle-style outlined captions) | "bar" (card with a coloured edge) | "tilt" (rotated sticker),
  "transition": "cut" | "fade" | "slide" | "zoom" | "pop",
  "colorGrade": "neutral" | "warm" | "cool" | "high-contrast" | "muted" | "black-and-white",
  "letterbox": boolean (black bars top and bottom),
  "wordByWord": boolean (captions appear a few words at a time, like auto-subtitles),
  "motion": "still" | "gentle" | "strong" (camera movement / zoom)
}`;
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 800,
    system: "You are a video editor who reverse-engineers the editing style of short social videos. Respond with a single JSON object only.",
    messages: [
      {
        role: "user",
        content: [
          ...frames.map((f) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.toString("base64") } })),
          { type: "text" as const, text: prompt },
        ],
      },
    ],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = referenceSchema.safeParse(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
  if (!parsed.success) throw new Error("We couldn't read the style of that video. Try another one.");
  const r = parsed.data;
  const base: StyleId = (STYLE_IDS as string[]).includes(r.closestStyle) ? (r.closestStyle as StyleId) : "bold";
  const font = FONT_MAP[r.font];
  return {
    name: r.name.slice(0, 40),
    summary: r.summary.slice(0, 160),
    base,
    overrides: cleanOverrides({
      font: font.font,
      weight: font.weight,
      upper: r.uppercase,
      size: { small: 0.85, medium: 1, large: 1.3 }[r.textSize],
      placement: r.placement,
      treatment: r.treatment,
      transition: r.transition,
      grade: GRADES[r.colorGrade],
      letterbox: r.letterbox,
      wordByWord: r.wordByWord && r.treatment === "outline",
      motion: { still: 0.02, gentle: 0.08, strong: 0.16 }[r.motion],
      pace,
    }),
  };
}
