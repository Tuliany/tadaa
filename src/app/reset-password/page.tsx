"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/client";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/reset", { method: "POST", json: { token, password } });
      router.push("/brands");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-3xl font-black tracking-tight">Link not valid</h1>
        <p className="mt-2 text-ink/60">This page needs the link from your reset email.</p>
        <Link href="/forgot-password" className="btn-primary mt-6">Get a new link</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-3xl font-black tracking-tight">Choose a new password</h1>
      <form onSubmit={submit} className="card mt-8 p-6 space-y-4">
        <div>
          <label className="label" htmlFor="pw">New password</label>
          <input id="pw" type="password" required minLength={8} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-ink/45 mt-1">At least 8 characters</p>
        </div>
        <div>
          <label className="label" htmlFor="pw2">Repeat it</label>
          <input id="pw2" type="password" required autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && (
          <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">
            {error} {error.includes("expired") && <Link href="/forgot-password" className="underline">Get a new link</Link>}
          </p>
        )}
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>{busy ? "Saving…" : "Save and log in"}</button>
      </form>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
