"use client";

import { Player, Thumbnail } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import { Reel } from "@/remotion/Reel";
import { mediaUrl } from "@/lib/props";
import { STYLE_IDS, STYLES, type StyleId } from "@/lib/styles";
import { api } from "@/lib/client";
import { FPS, HEIGHT, WIDTH, reelDuration, timing } from "@/lib/templates";
import type { Brand, MediaItem, ReelRenderProps, ReferenceStyle, TemplateId } from "@/lib/types";
import type { LookValue } from "@/lib/looks";

/**
 * "Pick how it should look": a scrollable row of live previews, one per style, made with the brand's own
 * colours and photos. The selected one plays; the others show a still.
 */
export default function StylePicker({
  brand,
  brandId,
  template,
  media,
  value,
  recommended,
  onChange,
}: {
  brand: Pick<Brand, "name" | "colors" | "logoUrl" | "references">;
  /** When given, shows "Add your own reference" (upload a video to copy its edit). */
  brandId?: string;
  template: TemplateId;
  media: MediaItem[];
  value: LookValue;
  recommended: StyleId;
  onChange: (v: LookValue) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [refs, setRefs] = useState<ReferenceStyle[]>(brand.references ?? []);
  const [refUrl, setRefUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [refError, setRefError] = useState("");
  const [refNote, setRefNote] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setRefError("");
    setRefNote("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (refUrl.trim()) form.append("url", refUrl.trim());
      const ref = await api<ReferenceStyle>(`/api/brands/${brandId}/references`, { method: "POST", body: form });
      setRefs((r) => [ref, ...r.filter((x) => x.id !== ref.id)]);
      setRefUrl("");
      onChange(`ref:${ref.id}`);
    } catch (e) {
      setRefError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeRef(id: string) {
    if (!confirm("Remove this reference look?")) return;
    await api(`/api/brands/${brandId}/references?refId=${id}`, { method: "DELETE" }).catch(() => {});
    setRefs((r) => r.filter((x) => x.id !== id));
    if (value === `ref:${id}`) onChange(recommended);
  }

  function checkLink() {
    setRefError("");
    setRefNote(
      /instagram\.com|tiktok\.com|pinterest\./i.test(refUrl)
        ? "Instagram, TikTok and Pinterest don't let apps download videos from a link. Save the video to your phone or computer and upload it here – Tadaa will copy its edit."
        : "Upload the video file to copy its edit – we can't download videos from links.",
    );
  }

  // Sample content for the previews (the real text is written after you click Make).
  const base = useMemo<ReelRenderProps>(() => {
    const pics = media.slice(0, 3);
    const slides =
      template === "tips"
        ? [{ text: "1. Start with the basics" }, { text: "2. Keep it simple" }, { text: "3. Ask an expert" }]
        : template === "beforeAfter"
          ? [{ text: "Before" }, { text: "After" }]
          : [{ text: "See what makes us different" }, { text: "Made for people like you" }, { text: "Ready when you are" }];
    return {
      brand,
      script: {
        template,
        hook: `This is ${brand.name}`,
        slides: slides.map((s, i) => ({ ...s, mediaId: pics.length ? pics[i % pics.length].id : undefined })),
        cta: "Get in touch today",
        caption: "",
        hashtags: [],
      },
      media: pics.map((m) => ({ id: m.id, kind: m.kind, url: mediaUrl(m.id) })),
    };
  }, [brand, template, media]);

  // Bring the picked style into view (it may sit off-screen to the right).
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && row.current) row.current.scrollTo({ left: el.offsetLeft - row.current.offsetLeft - 8, behavior: "smooth" });
  }, [value]);

  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <div>
      <p className="text-ink/70">
        Picked for your brand: <strong>{value.startsWith("ref:") ? refs.find((r) => `ref:${r.id}` === value)?.name ?? STYLES[recommended].name : STYLES[recommended].name}</strong>. Tap another style to change it.
      </p>
      <div className="relative mt-4">
        <div ref={row} className="flex gap-4 overflow-x-auto pb-3 snap-x [scrollbar-width:thin]">
          {[
            ...refs.map((r) => ({ key: `ref:${r.id}` as LookValue, name: r.name, tagline: r.summary, style: r.base, overrides: r.overrides, refId: r.id })),
            ...STYLE_IDS.map((id) => ({ key: id as LookValue, name: STYLES[id].name, tagline: STYLES[id].tagline, style: id, overrides: undefined, refId: undefined })),
          ].map(({ key, name, tagline, style, overrides, refId }) => {
            const id = key;
            const props: ReelRenderProps = { brand: base.brand, media: base.media, script: { ...base.script, style, styleOverrides: overrides } };
            const t = timing(props.script);
            const selected = id === value;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={`group relative w-[150px] shrink-0 snap-start text-left`}
                aria-pressed={selected}
                title={tagline}
              >
                <div
                  className={`relative aspect-[9/16] overflow-hidden rounded-2xl bg-black ring-offset-2 transition ${
                    selected ? "ring-3 ring-coral" : "ring-1 ring-black/10 group-hover:ring-black/30"
                  }`}
                >
                  {selected ? (
                    <Player
                      component={Reel}
                      inputProps={props}
                      durationInFrames={reelDuration(props.script)}
                      fps={FPS}
                      compositionWidth={WIDTH}
                      compositionHeight={HEIGHT}
                      style={{ width: "100%", height: "100%" }}
                      autoPlay
                      loop
                      initiallyMuted
                      acknowledgeRemotionLicense
                    />
                  ) : (
                    <Thumbnail
                      component={Reel}
                      inputProps={props}
                      durationInFrames={reelDuration(props.script)}
                      frameToDisplay={t.hook + Math.round(t.slide * 0.6)}
                      fps={FPS}
                      compositionWidth={WIDTH}
                      compositionHeight={HEIGHT}
                      style={{ width: "100%", height: "100%" }}
                    />
                  )}
                  {selected && (
                    <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-coral text-white shadow">✓</span>
                  )}
                  {id === recommended && !selected && (
                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-ink">Best match</span>
                  )}
                  {refId && (
                    <span className="absolute left-2 bottom-2 rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold text-white">From your reference</span>
                  )}
                  {refId && brandId && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Remove reference"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRef(refId);
                      }}
                      className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs text-white"
                    >
                      ×
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-bold leading-tight">{name}</p>
                <p className="text-xs text-ink/55 leading-snug line-clamp-2">{tagline}</p>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => scroll(1)}
          className="absolute -right-3 top-[110px] hidden h-11 w-11 place-items-center rounded-full bg-white text-xl shadow-lg ring-1 ring-black/10 sm:grid"
          aria-label="More styles"
        >
          ›
        </button>
      </div>

      {brandId && (
        <div className="mt-6">
          <p className="font-bold">Add your own reference</p>
          <p className="mt-1 text-sm text-ink/60">
            Optional. Upload a Reel or TikTok you like: Tadaa copies its edit – pace, text style, transitions and colours – in your brand.
          </p>
          <div className="mt-3 rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold">The video (and its link, if you like)</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1"
                placeholder="https://www.instagram.com/reel/…"
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
                onBlur={() => refUrl.trim() && checkLink()}
              />
              <label className={`btn-ghost cursor-pointer justify-center whitespace-nowrap ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                {uploading ? "Studying the video… (about 30 s)" : "⬆ Upload a video"}
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(f);
                  }}
                />
              </label>
            </div>
            {refNote && <p className="mt-2 text-xs text-ink/60">{refNote}</p>}
            {refError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{refError}</p>}
            <p className="mt-2 text-xs text-ink/45">Only upload videos you have the right to use as inspiration. The video is deleted after Tadaa has studied it.</p>
          </div>
        </div>
      )}
    </div>
  );
}
