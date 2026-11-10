"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Brand } from "@/lib/types";

export default function Brands() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  useEffect(() => {
    api<Brand[]>("/api/brands").then(setBrands).catch(() => setBrands([]));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight">My brands</h1>
        <Link href="/onboarding" className="btn-primary">Add a brand</Link>
      </div>
      {brands === null ? (
        <p className="mt-8 text-ink/50">Loading…</p>
      ) : brands.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="text-lg font-semibold">No brands yet</p>
          <p className="text-ink/60 mt-1">Add your first brand to start making Reels.</p>
          <Link href="/onboarding" className="btn-primary mt-5">Get started</Link>
        </div>
      ) : (
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {brands.map((b) => (
            <Link key={b.id} href={`/brands/${b.id}`} className="card p-5 flex items-center gap-4 hover:shadow-md transition">
              <div className="h-12 w-12 rounded-xl shrink-0" style={{ background: `linear-gradient(135deg, ${b.colors.primary}, ${b.colors.secondary})` }} />
              <div className="min-w-0">
                <p className="font-bold truncate">{b.name}</p>
                <p className="text-sm text-ink/55 truncate">{b.industry}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
