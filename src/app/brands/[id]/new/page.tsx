"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import ClipTrimmer from "@/components/ClipTrimmer";
import MediaPicker from "@/components/MediaPicker";
import StylePicker from "@/components/StylePicker";
import { pickStyle } from "@/lib/styles";
import { initialLook, lookPayload, type LookValue } from "@/lib/looks";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/props";
import { TEMPLATES } from "@/lib/templates";
import type { Brand, MediaItem, Reel, TemplateId } from "@/lib/types";

function NewReel() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateId>((params.get("template") as TemplateId) || "showcase");
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [style, setStyle] = useState<LookValue | null>(null);
  // Meme
  const [range, setRange] = useState<{ id?: string; start: number; end?: number }>({ start: 0 });
  const [caption, setCaption] = useState("");
  const [punchline, setPunchline] = useState("");
  const [ideas, setIdeas] = useState<{ caption: string; punchline: string }[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [sound, setSound] = useState(true);
  const isMeme = template === "meme";

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`)
      .then((b) => {
        setBrand(b);
        setStyle((s) => s ?? initialLook(b));
      })
      .catch(() => {});
  }, [id]);

  // Keep the library in sync so the style previews can use freshly uploaded photos.
  useEffect(() => {
    if (selected.some((sid) => !library.some((m) => m.id === sid)) || !library.length) {
      api<MediaItem[]>(`/api/brands/${id}/media`).then(setLibrary).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selected]);

  const previewMedia = useMemo(() => {
    const picked = selected.map((sid) => library.find((m) => m.id === sid)).filter((m): m is MediaItem => !!m);
    return picked.length ? picked : library.filter((m) => m.kind === "image").slice(0, 3);
  }, [selected, library]);
  const recommended = brand ? pickStyle(brand) : "bold";
  const clip = isMeme ? library.find((m) => m.id === selected[0]) : undefined;
  const clipId = clip?.id;

  // A new clip starts at its beginning.
  const clipRange = range.id === clipId ? range : { start: 0 };
  const setClipRange = (r: { start: number; end?: number }) => setRange({ ...r, id: clipId });

  async function suggestCaptions() {
    setIdeasBusy(true);
    setError("");
    try {
      const r = await api<{ options: { caption: string; punchline: string }[] }>(`/api/brands/${id}/meme-captions`, {
        method: "POST",
        json: { topic },
      });
      setIdeas(r.options);
      if (!caption && r.options[0]) {
        setCaption(r.options[0].caption);
        setPunchline(r.options[0].punchline);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIdeasBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const reel = await api<Reel>(`/api/brands/${id}/reels`, { method: "POST", json: {
          topic: topic.trim() || caption.trim(),
          template,
          mediaIds: selected,
          ...(style ? lookPayload(style) : {}),
          ...(isMeme ? { meme: { caption: caption.trim(), punchline: punchline.trim(), clipStart: clipRange.start, clipEnd: clipRange.end, sound } } : {}),
        },
      });
      router.push(`/reels/${reel.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const needsTwo = template === "beforeAfter" && selected.length < 2;
  const memeMissing = isMeme && (!selected.length || !caption.trim());

  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">New Reel</h1>

      <section className="mt-8">
        <h2 className="label">1 · Pick a format</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTemplate(t)}
              className={`card p-4 text-left transition ${template === t ? "ring-2 ring-coral border-transparent" : "hover:shadow-md"}`}
            >
              <p className="font-bold">{TEMPLATES[t].name}</p>
              <p className="text-sm text-ink/60 mt-1">{TEMPLATES[t].description}</p>
              <p className="text-xs text-ink/45 mt-2">📷 {TEMPLATES[t].mediaHint}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="label">2 · What is it about?{isMeme ? " (optional)" : ""}</h2>
        <input
          className="input text-base"
          placeholder={
            isMeme
              ? "E.g. clients asking for 'one small change', Monday mornings, when the order finally arrives"
              : "E.g. our new autumn menu, a kitchen renovation in Täby, how to pick the right running shoe"
          }
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </section>

      <section className="mt-8">
        <h2 className="label">
          3 ·{" "}
          {isMeme
            ? "Your clip (your own, or find a licence-free one)"
            : `Photos & clips ${template === "beforeAfter" ? "(tap the BEFORE first, then the AFTER)" : "(in the order you want them)"}`}
        </h2>
        <MediaPicker brandId={id} template={template} selected={selected} onChange={setSelected} onError={setError} />
        {isMeme && <p className="mt-2 text-xs text-ink/45">Use clips you filmed or have the rights to – not clips from TV, films or other people&apos;s videos.</p>}
      </section>

      {isMeme && clip?.kind === "video" && (
        <section className="mt-8">
          <h2 className="label">4 · Choose the moment</h2>
          <div className="card p-4">
            <ClipTrimmer key={clip.id} src={mediaUrl(clip.id)} duration={clip.duration} start={clipRange.start} end={clipRange.end} withEnd onChange={setClipRange} />
            <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="accent-coral" checked={sound} onChange={(e) => setSound(e.target.checked)} />
              Keep the clip&apos;s sound
            </label>
          </div>
        </section>
      )}

      {isMeme && (
        <section className="mt-8">
          <h2 className="label">{clip?.kind === "video" ? "5" : "4"} · The caption</h2>
          <div className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={suggestCaptions} disabled={ideasBusy}>
                {ideasBusy ? "Thinking…" : ideas ? "↻ More ideas" : "✨ Suggest captions"}
              </button>
              <span className="text-xs text-ink/45">or write your own</span>
            </div>
            {ideas && (
              <div className="grid gap-2">
                {ideas.map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setCaption(o.caption);
                      setPunchline(o.punchline);
                    }}
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${caption === o.caption ? "border-coral bg-coral/5" : "border-black/10 hover:border-coral/50"}`}
                  >
                    <span className="font-semibold">{o.caption}</span>
                    {o.punchline && <span className="text-ink/55"> → {o.punchline}</span>}
                  </button>
                ))}
              </div>
            )}
            <input className="input" placeholder="Top caption, e.g. When the client says 'just one small change'" maxLength={110} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <input className="input" placeholder="Punchline at the end (optional)" maxLength={50} value={punchline} onChange={(e) => setPunchline(e.target.value)} />
          </div>
        </section>
      )}

      {brand && style && !isMeme && (
        <section className="mt-8">
          <h2 className="label">4 · Pick how it should look</h2>
          <StylePicker brand={brand} brandId={id} template={template} media={previewMedia} value={style} recommended={recommended} onChange={setStyle} />
        </section>
      )}

      {error && <p className="mt-6 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}

      <div className="mt-8 flex items-center justify-end gap-4">
        {needsTwo && <p className="text-sm text-ink/55">Select a before and an after photo</p>}
        {memeMissing && <p className="text-sm text-ink/55">{selected.length ? "Add a caption" : "Pick a clip"}</p>}
        <button className="btn-primary px-8 py-3 text-base" onClick={generate} disabled={busy || (!isMeme && !topic.trim()) || needsTwo || memeMissing}>
          {busy ? "Making your Reel…" : "Make my Reel ✨"}
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <NewReel />
    </Suspense>
  );
}
