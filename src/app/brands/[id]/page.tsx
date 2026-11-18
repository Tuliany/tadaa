"use client";

import Link from "next/link";
import ErrorNote from "@/components/ErrorNote";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import ThisWeek from "@/components/ThisWeek";
import { TEMPLATES } from "@/lib/templates";
import type { Brand, Reel } from "@/lib/types";


export default function BrandDashboard() {
  const { id } = useParams<{ id: string }>();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`).then(setBrand).catch((e) => setError(e.message));
    api<Reel[]>(`/api/brands/${id}/reels`).then(setReels).catch(() => {});
  }, [id]);

  if (!brand) return <p className="text-ink/50">{error || "Loading…"}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl" style={{ background: `linear-gradient(135deg, ${brand.colors.primary}, ${brand.colors.secondary})` }} />
          <div>
            <h1 className="text-3xl font-black tracking-tight">{brand.name}</h1>
            <p className="text-ink/55">{brand.industry} · {brand.voice}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/brands/${id}/edit`} className="btn-ghost">Brand Brain</Link>
          <Link href={`/brands/${id}/new`} className="btn-primary">+ New Reel</Link>
        </div>
      </div>

      <ErrorNote error={error} className="mt-6" />

      <div className="mt-8 grid xl:grid-cols-[1fr_340px] gap-8">
        <section>
          <h2 className="font-bold text-lg">Your Reels</h2>
          {reels.length === 0 ? (
            <div className="card mt-4 p-10 text-center">
              <p className="font-semibold">No Reels yet</p>
              <p className="text-sm text-ink/60 mt-1">Upload a photo or two and Tadaa does the rest.</p>
              <Link href={`/brands/${id}/first-reel`} className="btn-primary mt-5">Make your first Reel</Link>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
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
          <ThisWeek brandId={id} />
        </aside>
      </div>
    </div>
  );
}
