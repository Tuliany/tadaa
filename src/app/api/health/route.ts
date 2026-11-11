import { aiEnabled } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** Quick status check: is the app up, and are the AI key and email configured? */
export async function GET() {
  const emailOn = Boolean(process.env.RESEND_API_KEY && process.env.TADAA_EMAIL_FROM);
  return Response.json({
    ok: true,
    ai: aiEnabled() ? "on" : "demo mode – ANTHROPIC_API_KEY is not set",
    email: emailOn ? "on" : "off – RESEND_API_KEY / TADAA_EMAIL_FROM not set (links go to Deploy Logs)",
    publicUrl: process.env.TADAA_PUBLIC_URL ? "set" : "not set (links use the request's host)",
  });
}
