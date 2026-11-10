"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { TEMPLATES } from "@/lib/templates";
import type { Brand, Plan, Reel } from "@/lib/types";

export default function BrandDashboard() {
  const { id } = useParams<{ id: string }>();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`).then(setBrand).catch((e) => setError(e.message));
    api<Reel[]>(`/api/brands/${id}/reels`).then(setReels).catch(() => {});
    api<Plan | null>(`/api/brands/${id}/plan`).then(setPlan).catch(() => {});
  }, [id]);

  async function makePlan() {
    setPlanning(true);
    setError("");
    try {
      setPlan(await api<Plan>(`/api/brands/${id}/plan`, { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlanning(false);
    }
  }

  if (!brand) return <p className="mx-auto max-w-6xl px-4 py-12 text-ink/50">{error || "Loading…"}</p>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl" style={{ background: `linear-gradient(135deg, ${brand.colors.primary}, ${brand.colors.secondary})` }} />
          <div>
            <h1 className="text-3xl font-black tracking-tight">{brand.name}</h1>
            <p className="text-ink/55">{brand.industry} · {brand.voice}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/brands/${id}/edit`} className="btn-ghost">Brand profile</Link>
          <Link href={`/brands/${id}/new`} className="btn-primary">+ New Reel</Link>
        </div>
      </div>

      {error && <p className="mt-6 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}

      <div className="mt-10 grid lg:grid-cols-[1fr_360px] gap-8">
        <section>
          <h2 className="font-bold text-lg">Your Reels</h2>
          {reels.length === 0 ? (
            <div className="card mt-4 p-10 text-center">
              <p className="font-semibold">No Reels yet</p>
              <p className="text-sm text-ink/60 mt-1">Upload a photo or two and Tadaa does the rest.</p>
              <Link href={`/brands/${id}/new`} className="btn-primary mt-5">Make your first Reel</Link>
            </div>
          ) : (
            <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {reels.map((r) => (
                <Link key={r.id} href={`/reels/${r.id}`} className="card p-4 hover:shadow-md transition">
                  <div
                    className="aspect-[9/16] rounded-xl p-4 flex items-center justify-center text-center text-white font-black text-lg leading-tight"
                    style={{ background: `linear-gradient(160deg, ${brand.colors.primary}, ${brand.colors.secondary})` }}
                  >
                    {r.script.hook}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{r.topic}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        r.status === "approved" ? "bg-green-100 text-green-800" : "bg-black/5 text-ink/60"
                      }`}
                    >
                      {r.status === "approved" ? "Approved" : "Draft"}
                    </span>
                  </div>
                  <p className="text-xs text-ink/45 mt-0.5">{TEMPLATES[r.script.template].name}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">This week&apos;s ideas</h2>
              <button className="text-sm font-semibold text-coral disabled:opacity-50" onClick={makePlan} disabled={planning}>
                {planning ? "Thinking…" : plan ? "Refresh" : "Generate"}
              </button>
            </div>
            {!plan ? (
              <p className="text-sm text-ink/60 mt-3">Get 7 Reel ideas tailored to {brand.name}, with what to film for each.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {plan.ideas.map((idea, i) => (
                  <li key={i} className="rounded-xl bg-cream p-3">
                    <p className="text-sm font-bold">{idea.title}</p>
                    <p className="text-sm text-ink/70">“{idea.hook}”</p>
                    <p className="text-xs text-ink/45 mt-1">📷 {idea.needsMedia}</p>
                    <Link
                      href={`/brands/${id}/new?template=${idea.template}&topic=${encodeURIComponent(`${idea.title}: ${idea.hook}`)}`}
                      className="mt-2 inline-block text-xs font-bold text-coral"
                    >
                      Make this Reel →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
