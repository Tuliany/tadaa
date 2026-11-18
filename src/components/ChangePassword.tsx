"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";

export default function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/auth/password", { method: "POST", json: { current, password: next } });
      setMsg({ ok: true, text: "Password changed. Other devices have been logged out." });
      setCurrent("");
      setNext("");
      setOpen(false);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Password</h2>
        {!open && (
          <button className="btn-ghost" onClick={() => setOpen(true)}>
            Change password
          </button>
        )}
      </div>
      {msg && <p className={`mt-3 rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      {open && (
        <form onSubmit={save} className="mt-4 space-y-3">
          <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <input className="input" type="password" autoComplete="new-password" placeholder="New password (at least 8 characters)" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
            <button type="button" className="text-sm text-ink/55" onClick={() => setOpen(false)}>Cancel</button>
            <Link href="/forgot-password" className="ml-auto text-sm text-ink/55 underline">Forgot it?</Link>
          </div>
        </form>
      )}
    </div>
  );
}
