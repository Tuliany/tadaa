"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { TEMPLATES } from "@/lib/templates";
import type { Brand, Reel } from "@/lib/types";

export default function Creations() {
  const { id } = useParams<{ id: string }>();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [reels, setReels] = useState<Reel[] | null>(null);

  useEffect(() => {
    api<Brand>(`/api/brands/${id}`).then(setBrand).catch(() => {});
    api<Reel[]>(`/api/brands/${id}/reels`).then(setReels).catch(() => setReels([]));
  }, [id]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight">Creations</h1>
        <Link href={`/brands/${id}/new`} className="btn-primary">+ New Reel</Link>
      </div>
      {reels === null ? (
        <p className="mt-8 text-ink/50">Loading…</p>
      ) : reels.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="font-semibold">Nothing here yet</p>
          <Link href={`/brands/${id}/first-reel`} className="btn-primary mt-5">Make your first Reel</Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {reels.map((r) => (
            <Link key={r.id} href={`/reels/${r.id}`} className="card p-3 hover:shadow-md transition">
              <div
                className="aspect-[9/16] rounded-xl p-4 flex items-center justify-center text-center text-white font-black leading-tight"
                style={{ background: brand ? `linear-gradient(160deg, ${brand.colors.primary}, ${brand.colors.secondary})` : "#333" }}
              >
                {r.script.hook}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate">{r.topic}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === "approved" ? "bg-green-100 text-green-800" : "bg-black/5 text-ink/60"}`}>
                  {r.status === "approved" ? "Approved" : "Draft"}
                </span>
              </div>
              <p className="text-xs text-ink/45">{TEMPLATES[r.script.template].name}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
