"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ErrorNote from "@/components/ErrorNote";
import { SlotCard, weekOf, type CalendarSlot, type CalendarView } from "@/components/SlotCard";
import { api } from "@/lib/client";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function IdeaStudio() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<CalendarView | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<CalendarView>(`/api/brands/${id}/calendar`).then(setView).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  // While more ideas are being written, check back every few seconds.
  useEffect(() => {
    if (!view?.planning) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [view, load]);

  async function saveSchedule(next: { days?: number[]; autoDraft?: boolean }) {
    if (!view) return;
    setSaving(true);
    setError("");
    try {
      setView(await api<CalendarView>(`/api/brands/${id}/calendar`, { method: "PATCH", json: next }));
      // Drafts that are already due are written right away: show them when they're ready.
      if (next.autoDraft) for (const ms of [25_000, 60_000]) setTimeout(load, ms);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const update = (s: CalendarSlot) =>
    setView((v) => v && { ...v, slots: v.slots.map((x) => (x.id === s.id ? s : x)).sort((a, b) => a.date.localeCompare(b.date)) });

  if (!view) {
    return (
      <div>
        <h1 className="text-3xl font-black tracking-tight">Idea Studio</h1>
        {error ? <ErrorNote error={error} className="mt-4" /> : <p className="mt-4 text-ink/55">Planning your next four weeks…</p>}
      </div>
    );
  }

  const weeks = new Map<string, CalendarSlot[]>();
  for (const s of view.slots) weeks.set(weekOf(s.date), [...(weeks.get(weekOf(s.date)) ?? []), s]);
  const toReview = view.slots.filter((s) => s.reel?.status === "draft" && !s.skipped).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Idea Studio</h1>
          <p className="text-ink/55">Your posting plan for the next four weeks{toReview ? ` · ${toReview} draft${toReview > 1 ? "s" : ""} to review` : ""}.</p>
        </div>
      </div>

      <div className="card mt-6 p-5">
        <p className="font-bold">Posting days</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const day = i + 1;
            const on = view.schedule.days.includes(day);
            return (
              <button
                key={d}
                disabled={saving}
                onClick={() => saveSchedule({ days: on ? view.schedule.days.filter((x) => x !== day) : [...view.schedule.days, day] })}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-ink text-white" : "bg-black/5 text-ink/60 hover:bg-black/10"}`}
              >
                {d}
              </button>
            );
          })}
          {saving && <span className="self-center text-sm text-ink/45">Updating plan…</span>}
          {!saving && view.planning && <span className="self-center text-sm text-ink/45">Writing more ideas…</span>}
        </div>
        <label className={`mt-4 flex items-start gap-3 text-sm ${view.autoDraftAvailable ? "" : "opacity-60"}`}>
          <input
            type="checkbox"
            className="mt-0.5"
            checked={view.autoDraftAvailable && view.schedule.autoDraft}
            disabled={!view.autoDraftAvailable || saving}
            onChange={(e) => saveSchedule({ autoDraft: e.target.checked })}
          />
          <span>
            <span className="font-semibold">Make drafts for me</span>
            <span className="block text-ink/55">
              {view.autoDraftAvailable
                ? `We write each Reel ${view.draftAheadDays} days before its posting day, using your least-used photos. You just review and approve. Each draft counts as one Reel on your plan.`
                : <>On a paid plan we write each Reel ahead of time for you. <Link href="/pricing" className="font-semibold text-coral">See plans →</Link></>}
            </span>
          </span>
        </label>
      </div>

      <ErrorNote error={error} className="mt-4" />

      {[...weeks.entries()].map(([week, slots]) => (
        <section key={week} className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink/45">
            Week of {new Date(`${week}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {slots.map((s) => (
              <SlotCard key={s.id} slot={s} today={view.today} brandId={id} onChange={update} onError={setError} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
