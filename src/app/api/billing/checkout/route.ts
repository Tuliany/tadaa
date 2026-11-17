import { z } from "zod";
import { handle, HttpError, requireUser } from "@/lib/auth";
import { planOf } from "@/lib/plans";
import { checkoutUrl, portalUrl, stripeConfigured } from "@/lib/stripe";

/** Start a subscription in Stripe Checkout (or, if already subscribed, open the portal to switch plans). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (!stripeConfigured()) throw new HttpError(503, "Payments aren't switched on yet. Please try again soon.");
  const body = z.object({ plan: z.enum(["starter", "pro"]) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw new HttpError(400, "Pick a plan.");
  const origin = new URL(req.url).origin;
  const current = planOf(user);
  try {
    if (current === "starter" || current === "pro") return Response.json({ url: await portalUrl(user, origin) });
    return Response.json({ url: await checkoutUrl(user, body.data.plan, origin) });
  } catch (e) {
    console.error("[stripe] checkout failed:", e);
    throw new HttpError(502, "Couldn't open the payment page. Please try again.");
  }
});
