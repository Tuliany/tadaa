import { currentUser } from "@/lib/auth";
import { checkAuthorize } from "@/lib/authorize";
import { saveOAuthCode } from "@/lib/db";
import { CODE_TTL_S, newToken, origin, sha256 } from "@/lib/oauth";

/** The consent form posts here. Issues a one-time code and sends the browser back to the app. */
export async function POST(req: Request) {
  // Only accept the form from our own pages.
  const from = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (from && host && new URL(from).host !== host) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const p = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const check = await checkAuthorize(p);
  if ("fatal" in check) return new Response(check.fatal, { status: 400 });
  if ("redirect" in check) return Response.redirect(check.redirect, 303);

  const user = await currentUser();
  if (!user) return Response.redirect(`${origin(req)}/login`, 303);

  const { client, redirectUri, state, codeChallenge, scope } = check.ok;
  const back = new URL(redirectUri);
  if (p.decision !== "allow") {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", "The user declined.");
  } else {
    const code = newToken("tdk");
    await saveOAuthCode({
      codeHash: sha256(code),
      clientId: client.clientId,
      userId: user.id,
      redirectUri,
      codeChallenge,
      scope,
      expiresAt: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
    });
    back.searchParams.set("code", code);
  }
  if (state) back.searchParams.set("state", state);
  back.searchParams.set("iss", origin(req));
  return Response.redirect(back.toString(), 303);
}
