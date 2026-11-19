"use client";

import { useState } from "react";
import { mediaUrl } from "@/lib/props";
import type { MediaItem, ReelScript, Slide } from "@/lib/types";

const MAX_SLIDES = 8;

/** Reel page: change a slide's picture, reorder, remove or add slides. Saves right away. */
export default function SlidesCard({
  script,
  media,
  saving,
  onSave,
}: {
  script: ReelScript;
  media: MediaItem[];
  saving: boolean;
  onSave: (slides: Slide[]) => void;
}) {
  // Which slide's picture is being picked ("new" = adding a slide).
  const [picking, setPicking] = useState<number | "new" | null>(null);
  const slides = script.slides;
  const fixed = script.template === "beforeAfter";
  const tips = script.template === "tips";
  const byId = new Map(media.map((m) => [m.id, m]));

  const save = (next: Slide[]) => {
    setPicking(null);
    onSave(next);
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...slides];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save(next);
  };
  const choose = (m: MediaItem | null) => {
    if (picking === "new") save([...slides, { text: "Your text here", mediaId: m?.id }]);
    else if (picking !== null)
      save(slides.map((x, j) => (j === picking ? { ...x, mediaId: m?.id, clipStart: m?.kind === "video" ? 0 : undefined, clipEnd: undefined } : x)));
  };

  const thumb = (m: MediaItem | undefined, cls: string) =>
    !m ? (
      <div className={`${cls} flex items-center justify-center bg-black/5 text-[10px] text-ink/40`}>No picture</div>
    ) : m.kind === "video" ? (
      <video src={`${mediaUrl(m.id)}#t=0.5`} muted preload="metadata" playsInline className={`${cls} bg-black object-cover`} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mediaUrl(m.id)} alt="" className={`${cls} object-cover`} loading="lazy" />
    );

  const picker = (
    <div className="mt-2 rounded-xl bg-black/[0.03] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-ink/45">{picking === "new" ? "Pick a picture for the new slide" : "Pick a new picture"}</p>
        <button className="text-sm text-ink/45" onClick={() => setPicking(null)}>
          Cancel
        </button>
      </div>
      {!media.length ? (
        <p className="mt-2 text-sm text-ink/55">Your library is empty. Add photos or clips to the brand first.</p>
      ) : (
        <div className="mt-2 grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-5">
          {tips && (
            <button disabled={saving} onClick={() => choose(null)} className="aspect-[9/16] rounded-lg bg-black/5 text-[11px] font-semibold text-ink/50 hover:ring-2 hover:ring-coral">
              No picture
            </button>
          )}
          {media
            .filter((m) => m.kind === "image" || m.kind === "video")
            .map((m) => (
              <button key={m.id} disabled={saving} onClick={() => choose(m)} className="relative overflow-hidden rounded-lg hover:ring-2 hover:ring-coral">
                {thumb(m, "aspect-[9/16] w-full")}
                {m.kind === "video" && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">▶</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="card p-5">
      <h2 className="font-bold">Slides</h2>
      <ul className="mt-3 space-y-2">
        {slides.map((slide, i) => (
          <li key={i}>
            <div className="flex items-center gap-3">
              {thumb(slide.mediaId ? byId.get(slide.mediaId) : undefined, "h-16 w-9 shrink-0 rounded-md")}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">{fixed ? (i === 0 ? "Before" : "After") : `Slide ${i + 1}`}</p>
                <p className="truncate text-sm">{slide.text || <span className="text-ink/35">No text</span>}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-sm">
                {!fixed && (
                  <>
                    <button className="h-8 w-8 rounded-full hover:bg-black/5 disabled:opacity-25" disabled={saving || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      ↑
                    </button>
                    <button className="h-8 w-8 rounded-full hover:bg-black/5 disabled:opacity-25" disabled={saving || i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      ↓
                    </button>
                  </>
                )}
                <button className="rounded-full px-2.5 py-1 font-semibold text-coral hover:bg-coral/10" disabled={saving} onClick={() => setPicking(picking === i ? null : i)}>
                  Picture
                </button>
                {!fixed && slides.length > 1 && (
                  <button className="rounded-full px-2 py-1 text-ink/40 hover:bg-black/5 hover:text-ink" disabled={saving} onClick={() => save(slides.filter((_, j) => j !== i))} aria-label="Remove slide">
                    ✕
                  </button>
                )}
              </div>
            </div>
            {picking === i && picker}
          </li>
        ))}
      </ul>
      {!fixed && slides.length < MAX_SLIDES && (
        <>
          <button className="btn-ghost mt-3 px-3 py-1.5 text-sm" disabled={saving} onClick={() => setPicking(picking === "new" ? null : "new")}>
            + Add slide
          </button>
          {picking === "new" && picker}
        </>
      )}
      <p className="mt-3 text-xs text-ink/40">Click a text in the video to change it.</p>
    </div>
  );
}
