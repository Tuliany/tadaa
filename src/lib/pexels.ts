/** Pexels: free stock videos that may be used commercially (https://www.pexels.com/license/). */

const API = "https://api.pexels.com";

export function pexelsConfigured() {
  return !!process.env.PEXELS_API_KEY;
}

interface PexelsVideo {
  id: number;
  url: string;
  image: string;
  duration: number;
  width: number;
  height: number;
  user: { name: string; url: string };
  video_files: { id: number; quality: string | null; file_type: string; width: number | null; height: number | null; link: string }[];
}

async function call<T>(path: string): Promise<T> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("Stock clips aren't set up on this server yet.");
  const res = await fetch(`${API}${path}`, { headers: { authorization: key } });
  if (res.status === 429) throw new Error("Too many stock searches right now. Try again in a minute.");
  if (!res.ok) throw new Error(`Stock search failed (${res.status}).`);
  return (await res.json()) as T;
}

const mp4s = (v: PexelsVideo) => v.video_files.filter((f) => f.file_type === "video/mp4" && f.width && f.height);

export async function searchVideos(query: string) {
  const q = new URLSearchParams({ query, orientation: "portrait", size: "medium", per_page: "18" });
  const res = await call<{ videos: PexelsVideo[] }>(`/videos/search?${q}`);
  return res.videos.map((v) => {
    const small = mp4s(v).sort((a, b) => a.width! - b.width!)[0];
    return { id: v.id, image: v.image, duration: v.duration, author: v.user.name, pageUrl: v.url, preview: small?.link };
  });
}

/** Best file to import: the largest MP4 that's at most 1080 px wide (Reels are 1080×1920). */
export async function videoForImport(id: number) {
  const v = await call<PexelsVideo>(`/videos/videos/${id}`);
  const files = mp4s(v).sort((a, b) => b.width! - a.width!);
  const file = files.find((f) => f.width! <= 1080) ?? files[files.length - 1];
  if (!file) throw new Error("That clip has no downloadable version.");
  return { link: file.link, author: v.user.name, pageUrl: v.url, duration: v.duration };
}
