import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { origin } from "@/lib/oauth";
import { authorizeUrl, linkedinConfigured } from "@/lib/linkedin";

const STATE_COOKIE = "tadaa_li_state";

/** Starts "Connect LinkedIn" for a brand. */
export const GET = handle(async (req: Request) => {
  const brandId = new URL(req.url).searchParams.get("brandId") ?? "";
  await requireBrand(brandId);
  if (!linkedinConfigured()) throw new HttpError(503, "LinkedIn isn't set up on this server yet.");

  // LinkedIn only returns to the registered address, so start on that same host (the state cookie must match).
  const base = origin(req);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && new URL(base).host !== host) {
    return Response.redirect(`${base}/api/connect/linkedin/start?brandId=${encodeURIComponent(brandId)}`, 302);
  }

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, `${state}.${brandId}`, {
    httpOnly: true,
    secure: base.startsWith("https://"),
    sameSite: "lax",
    path: "/api/connect/linkedin",
    maxAge: 600,
  });
  return Response.redirect(authorizeUrl(base, state), 302);
});
