"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || (mode === "signup" ? "/onboarding" : "/brands");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: { name, email, password } });
      router.push(next.startsWith("/") ? next : "/brands");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-3xl font-black tracking-tight">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-ink/60">
        {mode === "signup" ? "Your first on-brand Reel is a few minutes away." : "Log in to your brands and Reels."}
      </p>
      <form onSubmit={submit} className="card mt-8 p-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            className="input"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" ? (
            <p className="text-xs text-ink/45 mt-1">At least 8 characters</p>
          ) : (
            <Link href="/forgot-password" className="mt-1.5 inline-block text-xs font-semibold text-coral">Forgot password?</Link>
          )}
        </div>
        {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
        {mode === "signup" && (
          <p className="text-xs text-ink/50 text-center">
            By creating an account you agree to our <Link href="/terms" className="underline">terms</Link> and{" "}
            <Link href="/privacy" className="underline">privacy policy</Link>.
          </p>
        )}
      </form>
      <p className="mt-5 text-sm text-ink/60 text-center">
        {mode === "signup" ? (
          <>Already have an account? <Link className="font-semibold text-coral" href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></>
        ) : (
          <>New to Tadaa? <Link className="font-semibold text-coral" href="/signup">Create an account</Link></>
        )}
      </p>
    </div>
  );
}
