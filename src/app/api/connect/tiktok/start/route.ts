import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { origin } from "@/lib/oauth";
import { authorizeUrl, tiktokConfigured } from "@/lib/tiktok";

const STATE_COOKIE = "tadaa_tiktok_state";

/** Starts "Connect TikTok" for a brand: sends the browser to TikTok's consent screen. */
export const GET = handle(async (req: Request) => {
  const brandId = new URL(req.url).searchParams.get("brandId") ?? "";
  await requireBrand(brandId);
  if (!tiktokConfigured()) throw new HttpError(503, "TikTok isn't set up on this server yet.");

  // TikTok only returns to the registered address, so start on that same host (the state cookie must match).
  const base = origin(req);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && new URL(base).host !== host) {
    return Response.redirect(`${base}/api/connect/tiktok/start?brandId=${encodeURIComponent(brandId)}`, 302);
  }

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, `${state}.${brandId}`, {
    httpOnly: true,
    secure: base.startsWith("https://"),
    sameSite: "lax",
    path: "/api/connect/tiktok",
    maxAge: 600,
  });
  return Response.redirect(authorizeUrl(base, state), 302);
});
