"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import StylePicker from "@/components/StylePicker";
import { pickStyle, type StyleId } from "@/lib/styles";
import { api } from "@/lib/client";
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
  const [style, setStyle] = useState<StyleId | null>(null);

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`)
      .then((b) => {
        setBrand(b);
        setStyle((s) => s ?? pickStyle(b));
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

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const reel = await api<Reel>(`/api/brands/${id}/reels`, { method: "POST", json: { topic, template, mediaIds: selected, style } });
      router.push(`/reels/${reel.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const needsTwo = template === "beforeAfter" && selected.length < 2;

  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">New Reel</h1>

      <section className="mt-8">
        <h2 className="label">1 · Pick a format</h2>
        <div className="grid sm:grid-cols-3 gap-3">
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
        <h2 className="label">2 · What is it about?</h2>
        <input
          className="input text-base"
          placeholder="E.g. our new autumn menu, a kitchen renovation in Täby, how to pick the right running shoe"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </section>

      <section className="mt-8">
        <h2 className="label">3 · Photos & clips {template === "beforeAfter" ? "(tap the BEFORE first, then the AFTER)" : "(in the order you want them)"}</h2>
        <MediaPicker brandId={id} template={template} selected={selected} onChange={setSelected} onError={setError} />
      </section>

      {brand && style && (
        <section className="mt-8">
          <h2 className="label">4 · Pick how it should look</h2>
          <StylePicker brand={brand} template={template} media={previewMedia} value={style} recommended={recommended} onChange={setStyle} />
        </section>
      )}

      {error && <p className="mt-6 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}

      <div className="mt-8 flex items-center justify-end gap-4">
        {needsTwo && <p className="text-sm text-ink/55">Select a before and an after photo</p>}
        <button className="btn-primary px-8 py-3 text-base" onClick={generate} disabled={busy || !topic.trim() || needsTwo}>
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
