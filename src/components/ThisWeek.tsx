"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ErrorNote from "@/components/ErrorNote";
import { SlotCard, type CalendarSlot, type CalendarView } from "@/components/SlotCard";
import { api } from "@/lib/client";

/** Brand dashboard: the next posts from Idea Studio, with drafts waiting for approval first. */
export default function ThisWeek({ brandId }: { brandId: string }) {
  const [view, setView] = useState<CalendarView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<CalendarView>(`/api/brands/${brandId}/calendar`).then(setView).catch((e) => setError(e.message));
  }, [brandId]);
  // While the first ideas are still being written, check back.
  useEffect(() => {
    if (!view?.planning || view.slots.length) return;
    const t = setTimeout(() => api<CalendarView>(`/api/brands/${brandId}/calendar`).then(setView).catch(() => {}), 5000);
    return () => clearTimeout(t);
  }, [view, brandId]);

  const until = view ? new Date(Date.parse(`${view.today}T12:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10) : "";
  const shown = view
    ? view.slots
        .filter((s) => !s.skipped && ((s.reel?.status === "draft") || s.date <= until))
        .sort((a, b) => Number(b.reel?.status === "draft") - Number(a.reel?.status === "draft") || a.date.localeCompare(b.date))
        .slice(0, 4)
    : [];
  const update = (s: CalendarSlot) => setView((v) => v && { ...v, slots: v.slots.map((x) => (x.id === s.id ? s : x)) });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">Coming up</h2>
        <Link href={`/brands/${brandId}/calendar`} className="text-sm font-semibold text-coral">Idea Studio →</Link>
      </div>
      <ErrorNote error={error} className="mt-3" />
      {!view && !error && <p className="mt-3 text-sm text-ink/55">Planning your next posts…</p>}
      {view && !shown.length && (
        <p className="mt-3 text-sm text-ink/60">Nothing planned this week. <Link href={`/brands/${brandId}/calendar`} className="font-semibold text-coral">Pick posting days →</Link></p>
      )}
      <ul className="mt-3 space-y-3">
        {shown.map((s) => (
          <SlotCard key={s.id} slot={s} today={view!.today} brandId={brandId} onChange={update} onError={setError} />
        ))}
      </ul>
    </div>
  );
}
