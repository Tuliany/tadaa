import { aiEnabled } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** Quick status check: is the app up, and is the AI key configured? */
export async function GET() {
  return Response.json({ ok: true, ai: aiEnabled() ? "on" : "demo mode – ANTHROPIC_API_KEY is not set" });
}
