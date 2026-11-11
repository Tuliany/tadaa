"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/forgot", { method: "POST", json: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-3xl font-black tracking-tight">Forgot your password?</h1>
      {sent ? (
        <div className="card mt-8 p-6">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-1 text-sm text-ink/65">
            If there&apos;s an account for <strong>{email}</strong>, we&apos;ve sent a link to choose a new password. It works for 60 minutes.
          </p>
          <Link href="/login" className="btn-ghost mt-5">Back to log in</Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-ink/60">Enter your email and we&apos;ll send you a link to choose a new one.</p>
          <form onSubmit={submit} className="card mt-8 p-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" required className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
            <button className="btn-primary w-full py-3 text-base" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </form>
          <p className="mt-5 text-sm text-ink/60 text-center">
            Remembered it? <Link className="font-semibold text-coral" href="/login">Log in</Link>
          </p>
        </>
      )}
    </div>
  );
}
