import { handleWebhook } from "@/lib/stripe";

/** Stripe → Tadaa: keeps each account's plan in sync with its subscription. */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const body = await req.text();
  try {
    const type = await handleWebhook(body, signature);
    return Response.json({ received: true, type });
  } catch (e) {
    const msg = (e as Error).message;
    const bad = /signature|timestamp|No signatures/i.test(msg);
    console.error("[stripe] webhook failed:", msg);
    // 400 for forged/garbled requests; 500 makes Stripe retry later for anything else.
    return new Response(bad ? "Invalid signature" : "Webhook error", { status: bad ? 400 : 500 });
  }
}
