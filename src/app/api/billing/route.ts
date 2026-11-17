import { handle, requireUser } from "@/lib/auth";
import { planSummary } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";

/** The signed-in user's plan and how much of it is used. */
export const GET = handle(async () => {
  const user = await requireUser();
  return Response.json({ ...planSummary(user), payments: stripeConfigured(), hasCustomer: !!user.stripeCustomerId });
});
