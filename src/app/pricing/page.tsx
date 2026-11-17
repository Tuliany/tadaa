"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBilling, goToStripe, type Billing } from "@/lib/billing-client";

const PLANS = [
  {
    id: "trial" as const,
    name: "Free trial",
    price: "€0",
    per: "",
    blurb: "Try Tadaa on your own business.",
    features: ["3 Reels", "1 brand", "All looks and formats", "Post to Instagram, Facebook, TikTok & LinkedIn", "Small “Made with Tadaa” mark"],
  },
  {
    id: "starter" as const,
    name: "Starter",
    price: "€20",
    per: "/month",
    blurb: "For one business posting every week.",
    features: ["20 Reels a month", "1 brand", "All looks, formats and reference looks", "Post to Instagram, Facebook, TikTok & LinkedIn", "No watermark"],
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "€50",
    per: "/month",
    blurb: "For busy businesses and small agencies.",
    features: ["100 Reels a month", "Up to 5 brands", "All looks, formats and reference looks", "Post to Instagram, Facebook, TikTok & LinkedIn", "No watermark"],
    popular: true,
  },
];

export default function Pricing() {
  const [billing, setBilling] = useState<Billing | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBilling().then(setBilling).catch(() => setBilling(null));
  }, []);

  async function choose(plan: "starter" | "pro") {
    setBusy(plan);
    setError("");
    try {
      await goToStripe("/api/billing/checkout", plan);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const current = billing?.plan;
  const subscribed = current === "starter" || current === "pro";

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="text-center text-4xl font-black tracking-tight">Simple pricing</h1>
      <p className="mt-3 text-center text-ink/60">Start free. Upgrade when Tadaa is part of your week. Cancel any time.</p>
      {error && <p className="mx-auto mt-6 max-w-xl rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = current === p.id;
          return (
            <div key={p.id} className={`card relative flex flex-col p-6 ${p.popular ? "border-2 border-coral" : ""}`}>
              {p.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-coral px-3 py-0.5 text-xs font-bold text-white">Most popular</span>
              )}
              <h2 className="text-lg font-bold">{p.name}</h2>
              <p className="mt-2">
                <span className="text-4xl font-black">{p.price}</span>
                <span className="text-ink/50">{p.per}</span>
              </p>
              <p className="mt-2 text-sm text-ink/60">{p.blurb}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-coral">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {billing === undefined ? (
                  <div className="h-11" />
                ) : p.id === "trial" ? (
                  billing ? (
                    <p className="py-2.5 text-center text-sm font-semibold text-ink/50">{isCurrent ? "Your current plan" : "Included"}</p>
                  ) : (
                    <Link href="/signup" className="btn-ghost w-full justify-center">Start free</Link>
                  )
                ) : !billing ? (
                  <Link href={`/signup?next=${encodeURIComponent("/pricing")}`} className={`${p.popular ? "btn-primary" : "btn-ghost"} w-full justify-center`}>
                    Get {p.name}
                  </Link>
                ) : isCurrent ? (
                  <button className="btn-ghost w-full justify-center" disabled={!!busy} onClick={() => goToStripe("/api/billing/portal").catch((e) => setError(e.message))}>
                    Your plan · Manage
                  </button>
                ) : current === "unlimited" ? (
                  <p className="py-2.5 text-center text-sm font-semibold text-ink/50">You have unlimited use</p>
                ) : (
                  <button className={`${p.popular ? "btn-primary" : "btn-ghost"} w-full justify-center`} disabled={!!busy} onClick={() => choose(p.id as "starter" | "pro")}>
                    {busy === p.id ? "Opening…" : subscribed ? `Switch to ${p.name}` : `Get ${p.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-8 text-center text-sm text-ink/50">
        Prices in euro, VAT included. Billed monthly through Stripe. Unused Reels don&apos;t roll over.{" "}
        <Link href="/terms" className="underline">Terms</Link>
      </p>
    </div>
  );
}
