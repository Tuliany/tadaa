"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { MediaItem } from "@/lib/types";

interface Hit {
  id: string;
  image?: string;
  duration: number;
  author: string;
  pageUrl: string;
  preview?: string;
  portrait: boolean;
}

const SUGGESTIONS = ["surprised", "celebrating", "laughing", "facepalm", "thumbs up", "dancing", "coffee", "office"];

/** Search licence-free vertical stock clips (Pixabay or Pexels) and add one to the brand's library. */
export default function StockClipSearch({
  brandId,
  onImported,
  onError,
}: {
  brandId: string;
  onImported: (item: MediaItem) => void;
  onError: (msg: string) => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [provider, setProvider] = useState("");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    api<{ available: boolean; provider: string | null }>("/api/stock/videos")
      .then((r) => {
        setAvailable(r.available);
        setProvider(r.provider ?? "");
      })
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  async function search(term = q) {
    if (!term.trim()) return;
    setQ(term);
    setSearching(true);
    try {
      const r = await api<{ results: Hit[] }>(`/api/stock/videos?q=${encodeURIComponent(term.trim())}`);
      setHits(r.results);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function use(h: Hit) {
    setImporting(h.id);
    try {
      onImported(await api<MediaItem>(`/api/brands/${brandId}/media/stock`, { method: "POST", json: { id: h.id } }));
      setOpen(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setImporting(null);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(true)}>
        🎬 Find a stock clip
      </button>
    );
  }

  return (
    <div className="card p-4 w-full text-left">
      <div className="flex items-center justify-between">
        <p className="font-bold">Find a licence-free clip</p>
        <button type="button" className="text-sm text-ink/50" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input className="input flex-1" placeholder="E.g. surprised, celebrating, coffee" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" disabled={searching || !q.trim()}>
          {searching ? "…" : "Search"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold hover:bg-black/10" onClick={() => search(s)}>
            {s}
          </button>
        ))}
      </div>
      {hits && hits.length === 0 && <p className="mt-4 text-sm text-ink/50">No clips for that. Try another word.</p>}
      {hits && hits.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => use(h)}
              disabled={importing !== null}
              className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-black/10"
              title={`By ${h.author} on ${provider}`}
            >
              {h.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                h.preview && <video src={`${h.preview}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {h.preview && (
                <video
                  src={h.preview}
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100"
                  onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                  onMouseLeave={(e) => e.currentTarget.pause()}
                />
              )}
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{Math.round(h.duration)}s</span>
              {!h.portrait && <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">wide</span>}
              {importing === h.id && <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-bold text-white">Adding…</span>}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink/45">
        Videos provided by{" "}
        <a href={provider === "Pexels" ? "https://www.pexels.com" : "https://pixabay.com"} target="_blank" rel="noreferrer" className="underline">
          {provider}
        </a>
        . Free to use, but don&apos;t show the people in them in a bad light or as endorsing you. Wide clips get cropped to fit.
      </p>
    </div>
  );
}
