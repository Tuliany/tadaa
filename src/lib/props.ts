import { soundMoments } from "./templates";
import type { Brand, MediaItem, Reel, ReelRenderProps, ReelScript } from "./types";

export function mediaUrl(id: string) {
  return `/api/media/${id}`;
}

/** Where an imported sound is served from. */
export function soundUrl(id: string) {
  return `/api/sounds/${id}/file`;
}

function absolute(url: string | undefined, origin?: string) {
  if (!url) return undefined;
  if (!origin || /^https?:\/\//.test(url)) return url;
  return new URL(url, origin).toString();
}

/** Build the props for the Remotion composition. Pass `origin` when rendering server-side. */
export function toRenderProps(brand: Brand, reel: Pick<Reel, "script" | "mediaIds">, media: MediaItem[], origin?: string): ReelRenderProps {
  const byId = new Map(media.map((m) => [m.id, m]));
  return {
    brand: { name: brand.name, colors: brand.colors, logoUrl: absolute(brand.logoUrl, origin) },
    script: reel.script,
    media: reel.mediaIds
      .map((id) => byId.get(id))
      .filter((m): m is MediaItem => !!m)
      .map((m) => ({ id: m.id, kind: m.kind, url: absolute(mediaUrl(m.id), origin)! })),
    audio: audioOf(reel.script, origin),
  };
}

/** Music and sound effects as URLs and start frames. */
function audioOf(script: ReelScript, origin?: string): ReelRenderProps["audio"] {
  if (!script.music && !script.effects?.length) return undefined;
  const moments = new Map(soundMoments(script).map((m) => [m.at, m.frame]));
  const vol = (v: number | undefined, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(Math.max(v, 0), 1) : d);
  return {
    music: script.music ? { url: absolute(soundUrl(script.music.id), origin)!, volume: vol(script.music.volume, 0.35) } : undefined,
    effects: (script.effects ?? [])
      .filter((e) => moments.has(e.at))
      .map((e) => ({ url: absolute(soundUrl(e.sound.id), origin)!, from: moments.get(e.at)!, volume: vol(e.volume, 0.9) })),
  };
}
