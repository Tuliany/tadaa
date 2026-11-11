"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Me = { id: string; email: string; name: string } | null;

export default function Account() {
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => setMe(null));
  }, []);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/account", { method: "DELETE", json: { password } });
      router.push("/?deleted=1");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (me === undefined) return <p className="mx-auto max-w-xl px-4 py-14 text-ink/50">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <h1 className="text-3xl font-black tracking-tight">Account</h1>
      <div className="card mt-6 p-6">
        <p className="label">Name</p>
        <p className="font-semibold">{me?.name}</p>
        <p className="label mt-4">Email</p>
        <p className="font-semibold">{me?.email}</p>
      </div>

      <div className="card mt-6 p-6 border-red-200">
        <h2 className="text-lg font-bold">Delete account</h2>
        <p className="mt-1 text-sm text-ink/65">
          Permanently deletes your account, all your brands, uploaded photos and clips, and Reels. This can&apos;t be undone.
        </p>
        {!confirming ? (
          <button className="btn mt-4 border border-red-300 text-red-700 hover:bg-red-50" onClick={() => setConfirming(true)}>
            Delete my account…
          </button>
        ) : (
          <form onSubmit={remove} className="mt-4 space-y-3">
            <label className="label" htmlFor="pw">Enter your password to confirm</label>
            <input id="pw" type="password" required className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
            <div className="flex gap-3">
              <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy}>{busy ? "Deleting…" : "Delete everything"}</button>
              <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
      <p className="mt-6 text-sm text-ink/50">
        See our <Link href="/privacy" className="underline">privacy policy</Link> and <Link href="/terms" className="underline">terms</Link>.
      </p>
    </div>
  );
}
