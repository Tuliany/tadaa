"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBilling, type Billing } from "@/lib/billing-client";

/** Shows trial users how many free Reels they have left (and paid users when they're nearly out). */
export default function PlanBanner() {
  const [b, setB] = useState<Billing | null>(null);
  useEffect(() => {
    fetchBilling().then(setB).catch(() => {});
  }, []);
  if (!b || b.reelsIncluded === null) return null;
  const left = Math.max(0, b.reelsIncluded - b.reelsUsed);
  if (b.plan !== "trial" && left > 3) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-coral/10 px-5 py-3 text-sm">
      <span>
        {b.plan === "trial"
          ? left > 0
            ? `Free trial: ${left} of ${b.reelsIncluded} Reels left.`
            : "You've used your free Reels."
          : left > 0
            ? `${left} Reels left in your ${b.name} plan this month.`
            : `You've used this month's ${b.reelsIncluded} Reels.`}
      </span>
      <Link href="/pricing" className="font-bold text-coral">
        {b.plan === "trial" ? "See plans →" : "Upgrade →"}
      </Link>
    </div>
  );
}
