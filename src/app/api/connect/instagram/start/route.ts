import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { handle, HttpError, requireBrand } from "@/lib/auth";
import { authorizeUrl, instagramConfigured } from "@/lib/instagram";
import { origin } from "@/lib/oauth";

const STATE_COOKIE = "tadaa_ig_state";

/** Starts "Connect Instagram" (Unified login: Instagram or Facebook, no Page needed) for a brand. */
export const GET = handle(async (req: Request) => {
  const brandId = new URL(req.url).searchParams.get("brandId") ?? "";
  await requireBrand(brandId);
  if (!instagramConfigured()) throw new HttpError(503, "Instagram isn't set up on this server yet.");
  const base = origin(req);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && new URL(base).host !== host) {
    return Response.redirect(`${base}/api/connect/instagram/start?brandId=${encodeURIComponent(brandId)}`, 302);
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, `${state}.${brandId}`, {
    httpOnly: true,
    secure: base.startsWith("https://"),
    sameSite: "lax",
    path: "/api/connect/instagram",
    maxAge: 600,
  });
  return Response.redirect(authorizeUrl(base, state), 302);
});
