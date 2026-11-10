import * as cheerio from "cheerio";

export interface SiteInfo {
  url: string;
  title: string;
  siteName: string;
  description: string;
  lang: string;
  logoUrl?: string;
  imageUrls: string[];
  colors: string[];
  text: string;
}

const UA = "Mozilla/5.0 (compatible; TadaaBot/0.1; +https://tadaa.app)";

export function normalizeUrl(input: string) {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function fetchText(url: string, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function hexToRgb(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** True for whites, blacks and greys, which say little about a brand. */
function isNeutral(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 28 || max < 30 || min > 235;
}

export function extractColors(css: string, themeColor?: string) {
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let hex = m[1].toLowerCase();
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    counts.set(`#${hex}`, (counts.get(`#${hex}`) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .filter(([hex]) => !isNeutral(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
  if (themeColor && /^#[0-9a-f]{3,6}$/i.test(themeColor) && !isNeutral(themeColor)) {
    ranked.unshift(themeColor.toLowerCase());
  }
  return [...new Set(ranked)].slice(0, 5);
}

export function parseSite(url: string, html: string, extraCss = ""): SiteInfo {
  const $ = cheerio.load(html);
  const abs = (src?: string) => {
    if (!src) return undefined;
    try {
      return new URL(src, url).toString();
    } catch {
      return undefined;
    }
  };
  const meta = (sel: string) => $(sel).attr("content")?.trim() || "";

  const logoCandidate =
    $('img[class*="logo" i], img[id*="logo" i], img[alt*="logo" i], header img').first().attr("src") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    $('link[rel~="icon"]').attr("href");

  const imageUrls = [
    meta('meta[property="og:image"]'),
    ...$("img")
      .map((_, el) => $(el).attr("src"))
      .get(),
  ]
    .map((s) => abs(s))
    .filter((s): s is string => !!s && !s.startsWith("data:") && !/\.svg(\?|$)/i.test(s))
    .slice(0, 12);

  const inlineCss = $("style").text() + " " + $("[style]").map((_, el) => $(el).attr("style")).get().join(" ");

  $("script, style, noscript, svg, nav, footer").remove();
  const text = $("h1, h2, h3, p, li")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((t) => t.length > 2)
    .join("\n")
    .slice(0, 4000);

  const title = $("title").text().trim();
  return {
    url,
    title,
    siteName: meta('meta[property="og:site_name"]') || title.split(/[|\-–—]/)[0].trim(),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    lang: ($("html").attr("lang") || "").slice(0, 2).toLowerCase(),
    logoUrl: abs(logoCandidate),
    imageUrls,
    colors: extractColors(inlineCss + " " + extraCss, meta('meta[name="theme-color"]')),
    text,
  };
}

export async function scrapeSite(input: string): Promise<SiteInfo> {
  const url = normalizeUrl(input);
  const html = await fetchText(url);
  // Pull in up to two stylesheets so brand colours defined in CSS are found.
  const $ = cheerio.load(html);
  const cssLinks = $('link[rel="stylesheet"]')
    .map((_, el) => $(el).attr("href"))
    .get()
    .slice(0, 2);
  let css = "";
  for (const href of cssLinks) {
    try {
      css += await fetchText(new URL(href, url).toString(), 6000);
    } catch {
      /* ignore unreachable stylesheets */
    }
  }
  return parseSite(url, html, css);
}
