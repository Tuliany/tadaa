/**
 * Licence-free stock clips. Pixabay (PIXABAY_API_KEY) is the default; Pexels (PEXELS_API_KEY) also works.
 * Both allow commercial use without payment; we credit the source and the creator.
 */

export type StockProvider = "pixabay" | "pexels";

export interface StockHit {
  /** "<provider>:<id>" */
  id: string;
  image?: string;
  preview?: string;
  duration: number;
  author: string;
  pageUrl: string;
  portrait: boolean;
}

export function stockProvider(): StockProvider | null {
  if (process.env.PIXABAY_API_KEY) return "pixabay";
  if (process.env.PEXELS_API_KEY) return "pexels";
  return null;
}

export const PROVIDER_NAME: Record<StockProvider, string> = { pixabay: "Pixabay", pexels: "Pexels" };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 429) throw new Error("Too many stock searches right now. Try again in a minute.");
  if (!res.ok) throw new Error(`Stock search failed (${res.status}).`);
  return (await res.json()) as T;
}

// ---------- Pixabay ----------

interface PixabayFile {
  url: string;
  width: number;
  height: number;
  size: number;
  thumbnail?: string;
}
interface PixabayHit {
  id: number;
  pageURL: string;
  duration: number;
  user: string;
  videos: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayFile>>;
}

const pixabayUrl = (params: Record<string, string>) =>
  `https://pixabay.com/api/videos/?${new URLSearchParams({ key: process.env.PIXABAY_API_KEY!, safesearch: "true", ...params })}`;

function pixabayToHit(h: PixabayHit): StockHit {
  const v = h.videos;
  const any = v.medium ?? v.small ?? v.tiny ?? v.large;
  return {
    id: `pixabay:${h.id}`,
    image: v.medium?.thumbnail ?? v.small?.thumbnail ?? v.tiny?.thumbnail,
    preview: (v.tiny ?? v.small)?.url,
    duration: h.duration,
    author: h.user,
    pageUrl: h.pageURL,
    portrait: !!any && any.height > any.width,
  };
}

// ---------- Pexels ----------

interface PexelsVideo {
  id: number;
  url: string;
  image: string;
  duration: number;
  width: number;
  height: number;
  user: { name: string; url: string };
  video_files: { file_type: string; width: number | null; height: number | null; link: string }[];
}

const pexels = <T>(path: string) => getJson<T>(`https://api.pexels.com${path}`, { headers: { authorization: process.env.PEXELS_API_KEY! } });
const mp4s = (v: PexelsVideo) => v.video_files.filter((f) => f.file_type === "video/mp4" && f.width && f.height);

// ---------- Public ----------

// Pixabay asks that identical requests are cached for 24 hours.
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; hits: StockHit[] }>();

/** Search clips; vertical ones first (Reels are 9:16). */
export async function searchStock(query: string): Promise<StockHit[]> {
  const provider = stockProvider();
  if (!provider) throw new Error("Stock clips aren't set up on this server yet.");
  const key = `${provider}:${query.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.hits;
  const hits = await searchUncached(provider, query);
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), hits });
  return hits;
}

async function searchUncached(provider: StockProvider, query: string): Promise<StockHit[]> {
  if (provider === "pixabay") {
    const res = await getJson<{ hits: PixabayHit[] }>(pixabayUrl({ q: query.slice(0, 100), per_page: "60" }));
    const hits = res.hits.map(pixabayToHit);
    return [...hits.filter((h) => h.portrait), ...hits.filter((h) => !h.portrait)].slice(0, 24);
  }
  const q = new URLSearchParams({ query, orientation: "portrait", size: "medium", per_page: "18" });
  const res = await pexels<{ videos: PexelsVideo[] }>(`/videos/search?${q}`);
  return res.videos.map((v) => ({
    id: `pexels:${v.id}`,
    image: v.image,
    preview: mp4s(v).sort((a, b) => a.width! - b.width!)[0]?.link,
    duration: v.duration,
    author: v.user.name,
    pageUrl: v.url,
    portrait: v.height > v.width,
  }));
}

const ALLOWED_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(pixabay\.com|pexels\.com|vimeo\.com|vimeocdn\.com)\//;

/** The file to import: the best version that's not much larger than 1080p. */
export async function stockForImport(id: string) {
  const [provider, raw] = id.split(":");
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) throw new Error("Unknown clip.");
  let out: { link: string; author: string; pageUrl: string; source: string };
  if (provider === "pixabay" && process.env.PIXABAY_API_KEY) {
    const res = await getJson<{ hits: PixabayHit[] }>(pixabayUrl({ id: String(num) }));
    const h = res.hits[0];
    if (!h) throw new Error("That clip is no longer available.");
    const files = [h.videos.large, h.videos.medium, h.videos.small, h.videos.tiny].filter((f): f is PixabayFile => !!f?.url);
    const file = files.find((f) => Math.min(f.width, f.height) <= 1080) ?? files[files.length - 1];
    if (!file) throw new Error("That clip has no downloadable version.");
    out = { link: file.url, author: h.user, pageUrl: h.pageURL, source: "Pixabay" };
  } else if (provider === "pexels" && process.env.PEXELS_API_KEY) {
    const v = await pexels<PexelsVideo>(`/videos/videos/${num}`);
    const files = mp4s(v).sort((a, b) => b.width! - a.width!);
    const file = files.find((f) => Math.min(f.width!, f.height!) <= 1080) ?? files[files.length - 1];
    if (!file) throw new Error("That clip has no downloadable version.");
    out = { link: file.link, author: v.user.name, pageUrl: v.url, source: "Pexels" };
  } else {
    throw new Error("Unknown clip.");
  }
  if (!ALLOWED_HOSTS.test(out.link)) throw new Error("Unexpected file location from the stock library.");
  return out;
}
