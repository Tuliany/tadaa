"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { toRenderProps } from "@/lib/props";
import { TEMPLATES } from "@/lib/templates";
import type { Brand, MediaItem, Reel, ReelScript } from "@/lib/types";

const ReelPlayer = dynamic(() => import("@/components/ReelPlayer"), {
  ssr: false,
  loading: () => <div className="mx-auto w-full max-w-[340px] aspect-[9/16] rounded-[28px] bg-black/10 animate-pulse" />,
});

export default function ReelPage() {
  const { id } = useParams<{ id: string }>();
  const [reel, setReel] = useState<Reel | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<"" | "revise" | "approve" | "render" | "save">("");
  const [editing, setEditing] = useState<ReelScript | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<Reel>(`/api/reels/${id}`);
        setReel(r);
        const [b, m] = await Promise.all([api<Brand>(`/api/brands/${r.brandId}`), api<MediaItem[]>(`/api/brands/${r.brandId}/media`)]);
        setBrand(b);
        setMedia(m);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id]);

  const props = useMemo(() => (reel && brand ? toRenderProps(brand, editing ? { ...reel, script: editing } : reel, media) : null), [reel, brand, media, editing]);

  async function run<T>(kind: typeof busy, fn: () => Promise<T>) {
    setBusy(kind);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const revise = () =>
    run("revise", async () => {
      setReel(await api<Reel>(`/api/reels/${id}/revise`, { method: "POST", json: { request } }));
      setRequest("");
    });

  const setStatus = (status: Reel["status"]) =>
    run("approve", async () => setReel(await api<Reel>(`/api/reels/${id}`, { method: "PATCH", json: { status } })));

  const saveEdits = () =>
    run("save", async () => {
      setReel(await api<Reel>(`/api/reels/${id}`, { method: "PATCH", json: { script: editing } }));
      setEditing(null);
    });

  const download = () =>
    run("render", async () => {
      const { url } = await api<{ url: string }>(`/api/reels/${id}/render`, { method: "POST" });
      window.location.href = url;
    });

  async function copyCaption() {
    if (!reel) return;
    await navigator.clipboard.writeText(`${reel.script.caption}\n\n${reel.script.hashtags.join(" ")}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!reel || !brand || !props) return <p className="mx-auto max-w-5xl px-4 py-12 text-ink/50">{error || "Loading…"}</p>;
  const s = editing ?? reel.script;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href={`/brands/${brand.id}`} className="text-sm text-ink/55 hover:text-ink">← {brand.name}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black tracking-tight">{reel.topic}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${reel.status === "approved" ? "bg-green-100 text-green-800" : "bg-black/5 text-ink/60"}`}>
          {reel.status === "approved" ? "Approved" : "Waiting for your approval"}
        </span>
      </div>
      <p className="text-sm text-ink/50">{TEMPLATES[reel.script.template].name}</p>

      <div className="mt-8 grid md:grid-cols-[340px_1fr] gap-10">
        <div>
          <ReelPlayer props={props} />
          <div className="mt-4 grid gap-2">
            {reel.status === "approved" ? (
              <>
                <button className="btn-primary py-3" onClick={download} disabled={!!busy}>
                  {busy === "render" ? "Rendering video… (about a minute)" : "⬇ Download MP4"}
                </button>
                <button className="btn-ghost" onClick={() => setStatus("draft")} disabled={!!busy}>Back to draft</button>
              </>
            ) : (
              <button className="btn-primary py-3" onClick={() => setStatus("approved")} disabled={!!busy || !!editing}>
                ✓ Looks good – approve
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}

          <div className="card p-5">
            <h2 className="font-bold">Want a change?</h2>
            <p className="text-sm text-ink/55">Say it in your own words – Tadaa rewrites the Reel.</p>
            <div className="mt-3 flex gap-2">
              <input
                className="input"
                placeholder="E.g. make the hook funnier, mention we're open on Sundays"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && request.trim() && !busy && revise()}
              />
              <button className="btn-dark shrink-0" onClick={revise} disabled={!request.trim() || !!busy || !!editing}>
                {busy === "revise" ? "Rewriting…" : "Apply"}
              </button>
            </div>
            {reel.revisions.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-ink/45">
                {reel.revisions.map((r, i) => (
                  <li key={i}>↺ {r.request}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">On-screen text</h2>
              {editing ? (
                <div className="flex gap-2">
                  <button className="text-sm text-ink/55" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="text-sm font-bold text-coral" onClick={saveEdits} disabled={busy === "save"}>Save</button>
                </div>
              ) : (
                <button className="text-sm font-semibold text-coral" onClick={() => setEditing(structuredClone(reel.script))}>Edit text</button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <TextRow label="Hook" value={s.hook} editing={!!editing} onChange={(v) => editing && setEditing({ ...editing, hook: v })} />
              {s.slides.map((slide, i) => (
                <TextRow
                  key={i}
                  label={`Slide ${i + 1}`}
                  value={slide.text}
                  editing={!!editing}
                  onChange={(v) => editing && setEditing({ ...editing, slides: editing.slides.map((x, j) => (j === i ? { ...x, text: v } : x)) })}
                />
              ))}
              <TextRow label="End card" value={s.cta} editing={!!editing} onChange={(v) => editing && setEditing({ ...editing, cta: v })} />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Caption</h2>
              <button className="text-sm font-semibold text-coral" onClick={copyCaption}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            {editing ? (
              <textarea className="input mt-3 min-h-28" value={s.caption} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} />
            ) : (
              <p className="mt-3 whitespace-pre-line text-sm">{s.caption}</p>
            )}
            <p className="mt-3 text-sm text-coral/90">{s.hashtags.join(" ")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextRow({ label, value, editing, onChange }: { label: string; value: string; editing: boolean; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">{label}</span>
      {editing ? <input className="input py-1.5" value={value} onChange={(e) => onChange(e.target.value)} /> : <p className="text-sm font-medium">{value}</p>}
    </div>
  );
}
