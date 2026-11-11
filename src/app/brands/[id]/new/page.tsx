"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import { api } from "@/lib/client";
import { TEMPLATES } from "@/lib/templates";
import type { Reel, TemplateId } from "@/lib/types";

function NewReel() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateId>((params.get("template") as TemplateId) || "showcase");
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const reel = await api<Reel>(`/api/brands/${id}/reels`, { method: "POST", json: { topic, template, mediaIds: selected } });
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
