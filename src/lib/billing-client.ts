"use client";

export type Billing = {
  plan: "trial" | "starter" | "pro" | "unlimited";
  name: string;
  reelsUsed: number;
  reelsIncluded: number | null;
  brandsIncluded: number | null;
  watermark: boolean;
  renewsAt?: string;
  cancelAtPeriodEnd: boolean;
  status?: string;
  payments: boolean;
  hasCustomer: boolean;
};

/** The signed-in user's plan, or null when logged out (never redirects). */
export async function fetchBilling(): Promise<Billing | null> {
  const r = await fetch("/api/billing");
  return r.ok ? r.json() : null;
}

/** Sends the browser to Stripe (checkout, or the billing portal). */
export async function goToStripe(path: "/api/billing/checkout" | "/api/billing/portal", plan?: "starter" | "pro", flow?: "change" | "cancel") {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(plan ? { plan } : {}), ...(flow ? { flow } : {}) }) });
  const data = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !data.url) throw new Error(data.error || "Couldn't open the payment page.");
  window.location.href = data.url;
}
