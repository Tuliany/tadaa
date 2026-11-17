import type { PaidPlanId, User } from "./types";

/** Plans and what they include. Prices are in euro per month, VAT included. */
export const PLANS = {
  trial: { name: "Free trial", price: 0, reels: 3, brands: 1, watermark: true },
  starter: { name: "Starter", price: 20, reels: 20, brands: 1, watermark: false },
  pro: { name: "Pro", price: 50, reels: 100, brands: 5, watermark: false },
  unlimited: { name: "Unlimited", price: 0, reels: Infinity, brands: Infinity, watermark: false },
} as const;
export type PlanId = keyof typeof PLANS;
export const PAID_PLANS: PaidPlanId[] = ["starter", "pro"];

/** Stripe statuses that keep a paid plan working (past_due: Stripe is retrying the card). */
const LIVE = new Set(["active", "trialing", "past_due"]);

/** Accounts with unlimited use (the team), from TADAA_UNLIMITED_EMAILS. */
function unlimited(email: string) {
  return (process.env.TADAA_UNLIMITED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export function planOf(user: Pick<User, "email" | "subscription">): PlanId {
  if (unlimited(user.email)) return "unlimited";
  const sub = user.subscription;
  if (sub && LIVE.has(sub.status) && new Date(sub.currentPeriodEnd).getTime() > Date.now() - 3 * 86400_000) return sub.plan;
  return "trial";
}

/** Reels used against the current allowance. */
export function reelsUsed(user: Pick<User, "email" | "subscription" | "usage">) {
  const plan = planOf(user);
  if (plan === "trial") return user.usage?.trial ?? 0;
  if (plan === "unlimited") return 0;
  return user.usage?.periodStart === user.subscription?.currentPeriodStart ? (user.usage?.period ?? 0) : 0;
}

export function planSummary(user: Pick<User, "email" | "subscription" | "usage">) {
  const id = planOf(user);
  const p = PLANS[id];
  return {
    plan: id,
    name: p.name,
    reelsUsed: reelsUsed(user),
    reelsIncluded: isFinite(p.reels) ? p.reels : null,
    brandsIncluded: isFinite(p.brands) ? p.brands : null,
    watermark: p.watermark,
    renewsAt: id === "starter" || id === "pro" ? user.subscription?.currentPeriodEnd : undefined,
    cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd ?? false,
    status: user.subscription?.status,
  };
}
