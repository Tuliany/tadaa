import Stripe from "stripe";
import { getSetting, getUserByStripeCustomer, setSetting, updateUser } from "./db";
import { PLANS } from "./plans";
import type { PaidPlanId, User } from "./types";

/**
 * Stripe billing. Needs STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook).
 * Products and prices are created on first use (found again by lookup key), so nothing
 * has to be set up by hand in the Stripe dashboard.
 */

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

const g = globalThis as unknown as { __tadaaStripe?: Stripe; __tadaaPrices?: Promise<Record<PaidPlanId, string>> };
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Payments aren't set up yet.");
  return (g.__tadaaStripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

const LOOKUP: Record<PaidPlanId, string> = { starter: "tadaa_starter_monthly_eur", pro: "tadaa_pro_monthly_eur" };

/** Stripe as merchant of record (Managed Payments): Stripe handles VAT, fraud and disputes. */
export const managedPayments = () => process.env.STRIPE_MANAGED_PAYMENTS === "1";
/** Product tax code: Software as a Service – business use (eligible for Managed Payments). */
const TAX_CODE = "txcd_10103001";

/** Price ids for the paid plans, creating the product/price the first time. */
export function priceIds() {
  return (g.__tadaaPrices ??= (async () => {
    const s = stripe();
    const found = await s.prices.list({ lookup_keys: Object.values(LOOKUP), active: true, limit: 10 });
    const out = {} as Record<PaidPlanId, string>;
    for (const plan of Object.keys(LOOKUP) as PaidPlanId[]) {
      const existing = found.data.find((p) => p.lookup_key === LOOKUP[plan]);
      if (existing) {
        out[plan] = existing.id;
        // Products made before the tax code was set get it now (Managed Payments needs one).
        const productId = typeof existing.product === "string" ? existing.product : existing.product.id;
        const product = await s.products.retrieve(productId);
        const code = typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id;
        if (code !== TAX_CODE) await s.products.update(productId, { tax_code: TAX_CODE });
        continue;
      }
      const p = PLANS[plan];
      const product = await s.products.create({
        name: `Tadaa ${p.name}`,
        description: `${p.reels} Reels a month, ${p.brands === 1 ? "1 brand" : `up to ${p.brands} brands`}, no watermark.`,
        tax_code: TAX_CODE,
        metadata: { plan },
      });
      const price = await s.prices.create({
        product: product.id,
        currency: "eur",
        unit_amount: p.price * 100,
        recurring: { interval: "month" },
        tax_behavior: "inclusive",
        lookup_key: LOOKUP[plan],
        metadata: { plan },
      });
      out[plan] = price.id;
    }
    return out;
  })().catch((e) => {
    g.__tadaaPrices = undefined;
    throw e;
  }));
}

function planOfPrice(price: Stripe.Price | string | null | undefined): PaidPlanId | null {
  if (!price || typeof price === "string") return null;
  const key = price.lookup_key ?? price.metadata?.plan;
  if (key === LOOKUP.starter || key === "starter") return "starter";
  if (key === LOOKUP.pro || key === "pro") return "pro";
  return null;
}

/** Stripe customer for this user (created on first checkout). */
export async function customerFor(user: User) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const c = await stripe().customers.create({ email: user.email, name: user.name || undefined, metadata: { userId: user.id } });
  await updateUser(user.id, { stripeCustomerId: c.id });
  return c.id;
}

export async function checkoutUrl(user: User, plan: PaidPlanId, origin: string) {
  const prices = await priceIds();
  // With Managed Payments, Stripe collects the address and VAT details itself and some options aren't allowed.
  const taxOptions = managedPayments()
    ? { managed_payments: { enabled: true } }
    : {
        billing_address_collection: "required" as const,
        tax_id_collection: { enabled: true },
        customer_update: { name: "auto" as const, address: "auto" as const },
        ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { automatic_tax: { enabled: true } } : {}),
      };
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(user),
    client_reference_id: user.id,
    line_items: [{ price: prices[plan], quantity: 1 }],
    allow_promotion_codes: true,
    ...taxOptions,
    subscription_data: { metadata: { userId: user.id, plan } },
    success_url: `${origin}/account?billing=success`,
    cancel_url: `${origin}/pricing?billing=cancelled`,
  });
  return session.url!;
}

/** Our billing-portal settings (plan switching between Starter and Pro), created once and reused. */
async function portalConfiguration() {
  const s = stripe();
  const key = `stripePortalConfig:${process.env.STRIPE_SECRET_KEY!.slice(0, 12)}`;
  const saved = await getSetting<string>(key);
  if (saved) {
    const existing = await s.billingPortal.configurations.retrieve(saved).catch(() => null);
    if (existing?.active) return existing.id;
  }
  const prices = await priceIds();
  const items = await Promise.all(Object.values(prices).map((id) => s.prices.retrieve(id)));
  const conf = await s.billingPortal.configurations.create({
    business_profile: { headline: "Tadaa – manage your plan" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name"] },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: items.map((p) => ({ product: typeof p.product === "string" ? p.product : p.product.id, prices: [p.id] })),
      },
    },
  });
  await setSetting(key, conf.id);
  return conf.id;
}

/** Stripe's self-service page: change plan, card, cancel, invoices. */
export async function portalUrl(user: User, origin: string) {
  if (!user.stripeCustomerId) throw new Error("No subscription yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/account`,
    configuration: await portalConfiguration(),
  });
  return session.url;
}

/** Opens the portal straight on "change plan" for the user's subscription. */
export async function switchPlanUrl(user: User, origin: string) {
  if (!user.stripeCustomerId || !user.subscription) throw new Error("No subscription yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/account`,
    configuration: await portalConfiguration(),
    flow_data: { type: "subscription_update", subscription_update: { subscription: user.subscription.id }, after_completion: { type: "redirect", redirect: { return_url: `${origin}/account?billing=updated` } } },
  });
  return session.url;
}

/** Copies a Stripe subscription onto the user it belongs to. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let user = await getUserByStripeCustomer(customerId);
  if (!user && sub.metadata?.userId) {
    user = await updateUser(sub.metadata.userId, { stripeCustomerId: customerId }).catch(() => null);
  }
  if (!user) {
    console.warn(`[stripe] no user for customer ${customerId}`);
    return;
  }
  const item = sub.items.data[0];
  const plan = planOfPrice(item?.price) ?? (sub.metadata?.plan as PaidPlanId | undefined) ?? null;
  // Ignore an older subscription's events once the user has moved to a newer one.
  if (user.subscription && user.subscription.id !== sub.id && ["active", "trialing", "past_due"].includes(user.subscription.status) && sub.status !== "active") return;
  if (!plan || !item) {
    console.warn(`[stripe] subscription ${sub.id} has no known plan`);
    return;
  }
  await updateUser(user.id, {
    subscription: {
      id: sub.id,
      plan,
      status: sub.status,
      currentPeriodStart: new Date(item.current_period_start * 1000).toISOString(),
      // When a cancellation is scheduled, access ends then (Stripe sets cancel_at; older flows set cancel_at_period_end).
      currentPeriodEnd: new Date((sub.cancel_at ?? item.current_period_end) * 1000).toISOString(),
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
    },
  });
}

export async function handleWebhook(rawBody: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  const event = await stripe().webhooks.constructEventAsync(rawBody, signature, secret);
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe().subscriptions.retrieve(id));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      // Fetch fresh: events can arrive out of order.
      await syncSubscription(await stripe().subscriptions.retrieve(event.data.object.id));
      break;
  }
  return event.type;
}
