import type { Brand, MediaItem, Reel, ReelRenderProps } from "./types";

export function mediaUrl(id: string) {
  return `/api/media/${id}`;
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
  };
}
