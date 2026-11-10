"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { mediaUrl } from "@/lib/props";
import { TEMPLATES } from "@/lib/templates";
import type { MediaItem, Reel, TemplateId } from "@/lib/types";

function NewReel() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateId>((params.get("template") as TemplateId) || "showcase");
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<MediaItem[]>(`/api/brands/${id}/media`).then(setLibrary).catch(() => {});
  }, [id]);

  async function upload(files: FileList) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      [...files].forEach((f) => form.append("files", f));
      const items = await api<MediaItem[]>(`/api/brands/${id}/media`, { method: "POST", body: form });
      setLibrary((lib) => [...items, ...lib]);
      setSelected((s) => [...s, ...items.map((i) => i.id)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function toggle(mid: string) {
    setSelected((s) => (s.includes(mid) ? s.filter((x) => x !== mid) : [...s, mid]));
  }

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
    <div className="mx-auto max-w-4xl px-4 py-10">
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
        <div className="flex items-center justify-between">
          <h2 className="label">3 · Photos & clips {template === "beforeAfter" ? "(tap the BEFORE first, then the AFTER)" : "(in the order you want them)"}</h2>
          <label className="btn-ghost cursor-pointer text-xs py-1.5">
            {uploading ? "Uploading…" : "Upload"}
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          </label>
        </div>
        {library.length === 0 ? (
          <label className="card mt-2 p-10 grid place-items-center text-center cursor-pointer border-dashed border-2 border-black/10 hover:border-coral/50">
            <p className="font-semibold">Drop in photos or short clips</p>
            <p className="text-sm text-ink/55 mt-1">Shot on your phone is perfect. {template === "tips" ? "Optional for this format." : ""}</p>
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          </label>
        ) : (
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-3">
            {library.map((m) => {
              const n = selected.indexOf(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`relative aspect-[3/4] rounded-xl overflow-hidden bg-black/5 ${n >= 0 ? "ring-3 ring-coral" : "opacity-80 hover:opacity-100"}`}
                >
                  {m.kind === "video" ? (
                    <video src={mediaUrl(m.id)} muted className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(m.id)} alt="" className="h-full w-full object-cover" />
                  )}
                  {n >= 0 && (
                    <span className="absolute top-1.5 left-1.5 h-6 min-w-6 px-1.5 rounded-full bg-coral text-white text-xs font-black grid place-items-center">
                      {template === "beforeAfter" && n < 2 ? (n === 0 ? "BEFORE" : "AFTER") : n + 1}
                    </span>
                  )}
                  {m.kind === "video" && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 text-[10px] text-white">VIDEO</span>}
                </button>
              );
            })}
          </div>
        )}
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
