import { handle, HttpError, requireUser } from "@/lib/auth";
import { publicOrigin } from "@/lib/email";
import { portalUrl, stripeConfigured } from "@/lib/stripe";

/** Stripe's billing page: change plan or card, cancel, download invoices. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (!stripeConfigured() || !user.stripeCustomerId) throw new HttpError(400, "You don't have a subscription yet.");
  try {
    return Response.json({ url: await portalUrl(user, publicOrigin(req)) });
  } catch (e) {
    console.error("[stripe] portal failed:", e);
    throw new HttpError(502, "Couldn't open the billing page. Please try again.");
  }
});
