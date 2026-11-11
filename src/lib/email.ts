/**
 * Transactional email. Uses Resend when RESEND_API_KEY and TADAA_EMAIL_FROM are set;
 * otherwise writes the message to the server log so an admin can still act on it.
 */
export async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.TADAA_EMAIL_FROM;
  if (!key || !from) {
    console.log(`[email not configured] To: ${to}\nSubject: ${subject}\n${text}`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    console.error(`[email] Resend failed (${res.status}): ${await res.text()}`);
    console.log(`[email fallback] To: ${to}\nSubject: ${subject}\n${text}`);
    return { sent: false };
  }
  return { sent: true };
}

/** Public base URL for links in emails. */
export function publicOrigin(req: Request) {
  if (process.env.TADAA_PUBLIC_URL) return process.env.TADAA_PUBLIC_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
