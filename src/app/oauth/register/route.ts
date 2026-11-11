import { randomBytes } from "crypto";
import { saveOAuthClient } from "@/lib/db";
import { CORS, oauthError, sha256, validRedirectUri } from "@/lib/oauth";

/** OAuth 2.0 Dynamic Client Registration (RFC 7591). Claude registers itself here. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON.");
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirectUri)) {
    return oauthError("invalid_redirect_uri", "Provide https redirect URIs (or http on localhost).");
  }
  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    return oauthError("invalid_client_metadata", `Unsupported token_endpoint_auth_method: ${method}`);
  }
  const name = (typeof body.client_name === "string" && body.client_name.trim().slice(0, 80)) || "Connected app";
  const clientId = `tdc_${randomBytes(16).toString("base64url")}`;
  const secret = method === "none" ? undefined : randomBytes(32).toString("base64url");
  const now = new Date();
  await saveOAuthClient({
    clientId,
    secretHash: secret ? sha256(secret) : undefined,
    name,
    redirectUris: uris,
    createdAt: now.toISOString(),
  });
  return Response.json(
    {
      client_id: clientId,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
    },
    { status: 201, headers: { ...CORS, "cache-control": "no-store" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
