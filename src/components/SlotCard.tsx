"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { TEMPLATES } from "@/lib/templates";
import type { Slot } from "@/lib/types";

export type CalendarSlot = Slot & { reel: { id: string; status: "draft" | "approved"; rendered: boolean; hook: string } | null };
export type CalendarView = {
  today: string;
  /** More ideas are being written in the background. */
  planning: boolean;
  schedule: { days: number[]; autoDraft: boolean };
  autoDraftAvailable: boolean;
  draftAheadDays: number;
  slots: CalendarSlot[];
};

export function formatDate(date: string, today: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const diff = Math.round((d.getTime() - Date.parse(`${today}T12:00:00Z`)) / 86400_000);
  const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return diff === 0 ? `Today · ${label}` : diff === 1 ? `Tomorrow · ${label}` : label;
}

export function weekOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** What state a calendar post is in, for the badge. */
export function stateOf(s: CalendarSlot) {
  if (s.skipped) return { label: "Skipped", cls: "bg-black/5 text-ink/45" };
  if (s.reel?.status === "approved") return { label: "Approved", cls: "bg-emerald-100 text-emerald-800" };
  if (s.reel) return { label: "Needs review", cls: "bg-amber-100 text-amber-800" };
  return { label: "Idea", cls: "bg-cream text-ink/60" };
}

export function SlotCard({ slot, today, brandId, onChange, onError }: {
  slot: CalendarSlot;
  today: string;
  brandId: string;
  onChange: (s: CalendarSlot) => void;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const state = stateOf(slot);

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    onError("");
    try {
      const next = await api<Slot>(`/api/slots/${slot.id}`, { method: "POST", json: { action, ...extra } });
      onChange({ ...slot, ...next, reel: next.reelId ? (slot.reel?.id === next.reelId ? slot.reel : { id: next.reelId, status: "draft", rendered: false, hook: "" }) : null });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function approve(status: "approved" | "draft") {
    if (!slot.reel) return;
    setBusy("approve");
    onError("");
    try {
      await api(`/api/reels/${slot.reel.id}`, { method: "PATCH", json: { status } });
      onChange({ ...slot, reel: { ...slot.reel, status } });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const makeYourself = `/brands/${brandId}/new?template=${slot.template}&topic=${encodeURIComponent(`${slot.title}: ${slot.topic}`)}&slot=${slot.id}`;

  return (
    <li className={`card p-4 ${slot.skipped ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-ink/70">{formatDate(slot.date, today)}</span>
        <span className={`rounded-full px-2 py-0.5 font-semibold ${state.cls}`}>{state.label}</span>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-ink/55">{TEMPLATES[slot.template]?.name ?? slot.template}</span>
        {slot.occasion && <span className="rounded-full bg-coral/10 px-2 py-0.5 font-semibold text-coral">🎉 {slot.occasion}</span>}
      </div>
      <p className="mt-2 font-bold">{slot.title}</p>
      <p className="text-sm text-ink/70">“{slot.reel?.hook || slot.hook}”</p>
      {!slot.reel && <p className="mt-1 text-sm text-ink/55">{slot.topic}</p>}
      {!slot.reel && slot.needsMedia && <p className="mt-1 text-xs text-ink/45">📷 {slot.needsMedia}</p>}
      {slot.note && !slot.reel && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{slot.note}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {slot.skipped ? (
          <button className="btn-ghost px-3 py-1.5" disabled={!!busy} onClick={() => act("unskip")}>Bring back</button>
        ) : slot.reel ? (
          <>
            <Link href={`/reels/${slot.reel.id}`} className="btn-dark px-3 py-1.5">
              {slot.reel.status === "approved" ? "Open" : "Review"}
            </Link>
            {slot.reel.status === "draft" ? (
              <button className="btn-primary px-3 py-1.5" disabled={!!busy} onClick={() => approve("approved")}>
                {busy === "approve" ? "…" : "Approve"}
              </button>
            ) : (
              <button className="text-ink/50 font-semibold" disabled={!!busy} onClick={() => approve("draft")}>Undo approve</button>
            )}
          </>
        ) : (
          <>
            <button className="btn-primary px-3 py-1.5" disabled={!!busy} onClick={() => act("draft")}>
              {busy === "draft" ? "Writing draft…" : "Make draft"}
            </button>
            <Link href={makeYourself} className="btn-ghost px-3 py-1.5">Choose photos myself</Link>
            <button className="font-semibold text-coral disabled:opacity-50" disabled={!!busy} onClick={() => act("newIdea")}>
              {busy === "newIdea" ? "Thinking…" : "New idea"}
            </button>
            <label className="relative font-semibold text-ink/55 cursor-pointer">
              Move
              <input
                type="date"
                min={today}
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => e.target.value && act("move", { date: e.target.value })}
              />
            </label>
            <button className="font-semibold text-ink/40" disabled={!!busy} onClick={() => act("skip")}>Skip</button>
          </>
        )}
      </div>
    </li>
  );
}

