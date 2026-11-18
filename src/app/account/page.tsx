"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ChangePassword from "@/components/ChangePassword";
import { fetchBilling, goToStripe, type Billing } from "@/lib/billing-client";
import { api } from "@/lib/client";

type Me = { id: string; email: string; name: string } | null;

export default function Account() {
  const router = useRouter();
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [billing, setBilling] = useState<Billing | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [justPaid, setJustPaid] = useState(false);

  useEffect(() => {
    api<Me>("/api/auth/me").then(setMe).catch(() => setMe(null));
    const paid = new URLSearchParams(window.location.search).get("billing") === "success";
    // Stripe tells us about the new subscription a moment after checkout, so check again a few times.
    let tries = paid ? 8 : 1;
    const load = () =>
      fetchBilling()
        .then((b) => {
          setBilling(b);
          if (paid) setJustPaid(true);
          if (paid && b && b.plan === "trial" && --tries > 0) setTimeout(load, 1500);
        })
        .catch(() => {});
    load();
  }, []);

  async function manage() {
    setBillingBusy(true);
    try {
      await goToStripe("/api/billing/portal");
    } catch (e) {
      setError((e as Error).message);
      setBillingBusy(false);
    }
  }

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

      {billing && (
        <div className="card mt-6 p-6">
          {justPaid && billing.plan !== "trial" && (
            <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">Thank you! Your {billing.name} plan is active.</p>
          )}
          {justPaid && billing.plan === "trial" && (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Payment received – your plan will show here in a moment. Refresh if it doesn&apos;t.</p>
          )}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label">Plan</p>
              <p className="text-lg font-bold">{billing.name}</p>
            </div>
            {billing.plan === "starter" || billing.plan === "pro" ? (
              <button className="btn-ghost" onClick={manage} disabled={billingBusy}>
                {billingBusy ? "Opening…" : "Manage billing"}
              </button>
            ) : billing.plan === "trial" ? (
              <Link href="/pricing" className="btn-primary">See plans</Link>
            ) : null}
          </div>
          {billing.reelsIncluded !== null && (
            <div className="mt-4">
              <div className="flex justify-between text-sm">
                <span className="text-ink/60">{billing.plan === "trial" ? "Free Reels used" : "Reels this month"}</span>
                <span className="font-semibold">
                  {billing.reelsUsed} / {billing.reelsIncluded}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-black/5">
                <div className="h-2 rounded-full bg-coral" style={{ width: `${Math.min(100, (billing.reelsUsed / billing.reelsIncluded) * 100)}%` }} />
              </div>
            </div>
          )}
          {billing.renewsAt && (
            <p className="mt-3 text-sm text-ink/55">
              {billing.cancelAtPeriodEnd ? "Ends" : "Renews"} on {new Date(billing.renewsAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
              {billing.status === "past_due" && " · Payment failed – please update your card."}
            </p>
          )}
          {billing.plan === "trial" && billing.hasCustomer && (
            <button className="mt-3 text-sm text-ink/55 underline" onClick={manage} disabled={billingBusy}>
              Invoices and payment details
            </button>
          )}
        </div>
      )}

      <ChangePassword />

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
