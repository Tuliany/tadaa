"use client";

import { Player, Thumbnail } from "@remotion/player";
import { useEffect, useMemo, useRef } from "react";
import { Reel } from "@/remotion/Reel";
import { mediaUrl } from "@/lib/props";
import { STYLE_IDS, STYLES, type StyleId } from "@/lib/styles";
import { FPS, HEIGHT, WIDTH, reelDuration, timing } from "@/lib/templates";
import type { Brand, MediaItem, ReelRenderProps, TemplateId } from "@/lib/types";

/**
 * "Pick how it should look": a scrollable row of live previews, one per style, made with the brand's own
 * colours and photos. The selected one plays; the others show a still.
 */
export default function StylePicker({
  brand,
  template,
  media,
  value,
  recommended,
  onChange,
}: {
  brand: Pick<Brand, "name" | "colors" | "logoUrl">;
  template: TemplateId;
  media: MediaItem[];
  value: StyleId;
  recommended: StyleId;
  onChange: (s: StyleId) => void;
}) {
  const row = useRef<HTMLDivElement>(null);

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
        Picked for your brand: <strong>{STYLES[recommended].name}</strong>. Tap another style to change it.
      </p>
      <div className="relative mt-4">
        <div ref={row} className="flex gap-4 overflow-x-auto pb-3 snap-x [scrollbar-width:thin]">
          {STYLE_IDS.map((id) => {
            const props: ReelRenderProps = { brand: base.brand, media: base.media, script: { ...base.script, style: id } };
            const t = timing(props.script);
            const selected = id === value;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={`group relative w-[150px] shrink-0 snap-start text-left`}
                aria-pressed={selected}
                title={STYLES[id].tagline}
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
                </div>
                <p className="mt-2 text-sm font-bold leading-tight">{STYLES[id].name}</p>
                <p className="text-xs text-ink/55 leading-snug">{STYLES[id].tagline}</p>
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
    </div>
  );
}
