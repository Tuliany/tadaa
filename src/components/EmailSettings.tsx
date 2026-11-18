"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

/** Account page: turn the Monday email on or off. */
export default function EmailSettings() {
  const [weekly, setWeekly] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ weekly: boolean }>("/api/auth/emails").then((r) => setWeekly(r.weekly)).catch(() => {});
  }, []);

  async function toggle(on: boolean) {
    setWeekly(on);
    setError("");
    try {
      setWeekly((await api<{ weekly: boolean }>("/api/auth/emails", { method: "PATCH", json: { weekly: on } })).weekly);
    } catch (e) {
      setWeekly(!on);
      setError((e as Error).message);
    }
  }

  return (
    <div className="card mt-6 p-6">
      <h2 className="font-bold text-lg">Emails</h2>
      <label className="mt-3 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5" checked={!!weekly} disabled={weekly === null} onChange={(e) => toggle(e.target.checked)} />
        <span>
          <span className="font-semibold">Your week, every Monday</span>
          <span className="block text-ink/55">The posts planned for the week, drafts waiting for your review, and how last week went.</span>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
