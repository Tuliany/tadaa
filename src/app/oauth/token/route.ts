import { consumeOAuthCode, deleteOAuthToken, getOAuthClient, getOAuthToken } from "@/lib/db";
import { CORS, issueTokens, oauthError, pkceMatches, sha256 } from "@/lib/oauth";
import type { OAuthClient } from "@/lib/types";

/** Token endpoint: authorization_code (with PKCE) and refresh_token grants. Also accepts RFC 7009 revocation via token + no grant_type. */
export async function POST(req: Request) {
  const params = await readParams(req);
  const grant = params.get("grant_type");

  const client = await authenticateClient(req, params);
  if (client instanceof Response) return client;

  if (!grant && params.get("token")) {
    // Revocation: delete whichever token this is.
    const hash = sha256(params.get("token")!);
    const t = (await getOAuthToken(hash, "refresh")) ?? (await getOAuthToken(hash, "access"));
    if (t && t.clientId === client.clientId) await deleteOAuthToken(hash);
    return new Response(null, { status: 200, headers: CORS });
  }

  if (grant === "authorization_code") {
    const code = params.get("code");
    const verifier = params.get("code_verifier");
    const redirectUri = params.get("redirect_uri");
    if (!code || !verifier) return oauthError("invalid_request", "code and code_verifier are required.");
    const stored = await consumeOAuthCode(sha256(code));
    if (!stored || stored.clientId !== client.clientId) return oauthError("invalid_grant", "The code is invalid or has expired.");
    if (redirectUri && redirectUri !== stored.redirectUri) return oauthError("invalid_grant", "redirect_uri does not match.");
    if (!pkceMatches(verifier, stored.codeChallenge)) return oauthError("invalid_grant", "PKCE verification failed.");
    return tokenResponse(await issueTokens(stored.userId, client.clientId, stored.scope));
  }

  if (grant === "refresh_token") {
    const refresh = params.get("refresh_token");
    if (!refresh) return oauthError("invalid_request", "refresh_token is required.");
    const stored = await getOAuthToken(sha256(refresh), "refresh");
    if (!stored || stored.clientId !== client.clientId) return oauthError("invalid_grant", "The refresh token is invalid or has expired.");
    await deleteOAuthToken(stored.tokenHash); // rotate
    return tokenResponse(await issueTokens(stored.userId, client.clientId, stored.scope));
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function tokenResponse(body: object) {
  return Response.json(body, { headers: { ...CORS, "cache-control": "no-store", pragma: "no-cache" } });
}

async function readParams(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(json).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}

async function authenticateClient(req: Request, params: URLSearchParams): Promise<OAuthClient | Response> {
  let clientId = params.get("client_id");
  let secret = params.get("client_secret");
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (basic) {
    const [id, sec] = Buffer.from(basic[1], "base64").toString().split(":");
    clientId = decodeURIComponent(id ?? "");
    secret = decodeURIComponent(sec ?? "");
  }
  if (!clientId) return oauthError("invalid_client", "client_id is required.", 401);
  const client = await getOAuthClient(clientId);
  if (!client) return oauthError("invalid_client", "Unknown client.", 401);
  if (client.secretHash && (!secret || sha256(secret) !== client.secretHash)) {
    return oauthError("invalid_client", "Client authentication failed.", 401);
  }
  return client;
}
