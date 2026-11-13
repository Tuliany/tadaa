"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import { api, apiStream } from "@/lib/client";
import { TEMPLATES } from "@/lib/templates";
import type { Brand, Plan, PlanIdea, Reel } from "@/lib/types";

/** Ideas that are far enough along to show while the plan is still streaming. */
function shownIdeas(partial: { ideas?: Partial<PlanIdea>[] }): PlanIdea[] {
  return (partial.ideas ?? [])
    .filter((i) => i && i.title && (i.template === "showcase" || i.template === "beforeAfter" || i.template === "tips"))
    .map((i) => ({ title: i.title!, template: i.template!, hook: i.hook ?? "", needsMedia: i.needsMedia ?? "" }));
}


function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-3">
        <span className="h-8 w-8 rounded-full bg-ink text-white grid place-items-center text-sm font-black">{n}</span>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {sub && <p className="mt-1 ml-11 text-sm text-ink/55">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function FirstReel() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [ideas, setIdeas] = useState<PlanIdea[] | null>(null);
  const [picked, setPicked] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`).then(setBrand).catch((e) => setError(e.message));
    (async () => {
      try {
        const existing = await api<Plan | null>(`/api/brands/${id}/plan`);
        if (existing) return setIdeas(existing.ideas);
        // Show ideas one by one as they're written.
        setStreaming(true);
        const plan = await apiStream<Plan, { ideas?: Partial<PlanIdea>[] }>(`/api/brands/${id}/plan`, { method: "POST" }, (p) => {
          const shown = shownIdeas(p);
          if (shown.length) setIdeas(shown);
        });
        setIdeas(plan.ideas);
      } catch (e) {
        setError((e as Error).message);
        setIdeas([]);
      } finally {
        setStreaming(false);
      }
    })();
  }, [id]);

  const idea = ideas?.[picked];
  const needsTwo = idea?.template === "beforeAfter" && mediaIds.length < 2;

  function updateIdea(i: number, patch: Partial<PlanIdea>) {
    setIdeas((list) => list?.map((x, j) => (j === i ? { ...x, ...patch } : x)) ?? null);
  }

  async function make() {
    if (!idea) return;
    setBusy(true);
    setError("");
    try {
      const reel = await api<Reel>(`/api/brands/${id}/reels`, {
        method: "POST",
        json: { topic: `${idea.title}: ${idea.hook}`, template: idea.template, mediaIds },
      });
      router.push(`/reels/${reel.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Let&apos;s make your first Reel.</h1>
        <p className="mt-2 text-ink/60">
          Three choices and it starts. Making this for <strong className="text-ink">{brand?.name ?? "…"}</strong>.{" "}
          <Link href={`/brands/${id}/edit`} className="underline">Edit your brand</Link> any time.
        </p>
      </div>

      <Step n={1} title="Where you'll post" sub="Optional – you can always download the video and post it yourself.">
        <div className="flex flex-wrap items-center gap-3">
          {["📸 Instagram", "📘 Facebook", "💼 LinkedIn", "🗂️ Google Drive", "✳️ Claude"].map((c) => (
            <span key={c} className="rounded-full bg-cream px-3.5 py-1.5 text-sm font-medium text-ink/70">{c}</span>
          ))}
          <Link href={`/brands/${id}/accounts`} className="text-sm font-semibold text-coral">Manage connections →</Link>
        </div>
      </Step>

      <Step n={2} title="Pick something to make" sub="Ideas written for your brand, audience and voice.">
        {ideas === null ? (
          <>
          <p className="mb-3 text-sm text-ink/55 animate-pulse">Writing ideas for {brand?.name ?? "your brand"}… (about 10 seconds)</p>
          <div className="grid md:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-black/5 animate-pulse" />
            ))}
          </div>
          </>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {ideas.map((it, i) => (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => setPicked(i)}
                onKeyDown={(e) => e.key === "Enter" && setPicked(i)}
                className={`rounded-2xl border p-4 text-left cursor-pointer transition ${
                  picked === i ? "border-coral bg-coral/5 ring-2 ring-coral/30" : "border-black/10 bg-white hover:border-black/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-ink/40">
                    {TEMPLATES[it.template].name}
                    {picked === i && <span className="ml-2 rounded-full bg-coral px-2 py-0.5 text-white">✓ Selected</span>}
                  </span>
                  <button
                    type="button"
                    className="text-sm text-ink/45 hover:text-ink"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(editing === i ? null : i);
                      setPicked(i);
                    }}
                  >
                    ✎
                  </button>
                </div>
                {editing === i ? (
                  <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <input className="input py-1.5" value={it.title} onChange={(e) => updateIdea(i, { title: e.target.value })} />
                    <input className="input py-1.5" value={it.hook} onChange={(e) => updateIdea(i, { hook: e.target.value })} />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 font-semibold leading-snug">{it.title}</p>
                    <p className="mt-1 text-sm text-ink/70">“{it.hook}”</p>
                  </>
                )}
                <p className="mt-2 text-xs text-ink/45">📷 {it.needsMedia}</p>
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step
        n={3}
        title="Add your photos or clips"
        sub={idea ? `${TEMPLATES[idea.template].mediaHint}.${idea.template === "beforeAfter" ? " Tap the before first, then the after." : ""}` : undefined}
      >
        <MediaPicker brandId={id} template={idea?.template ?? "showcase"} selected={mediaIds} onChange={setMediaIds} onError={setError} />
      </Step>

      {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}

      <div className="flex items-center justify-end gap-4 pb-10">
        {needsTwo && <p className="text-sm text-ink/55">Select a before and an after photo</p>}
        <button className="btn-primary px-8 py-3 text-base" onClick={make} disabled={!idea || busy || needsTwo || streaming}>
          {busy ? "Making your Reel…" : streaming ? "Writing ideas…" : "Make it ✨"}
        </button>
      </div>
    </div>
  );
}
