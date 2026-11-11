import { getOAuthClient } from "./db";
import { SCOPE } from "./oauth";
import type { OAuthClient } from "./types";

export interface AuthorizeRequest {
  client: OAuthClient;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope: string;
}

type Params = Record<string, string | undefined>;

/**
 * Validate an /oauth/authorize request.
 * `fatal` errors are shown on the page (we can't trust the redirect URI);
 * `redirect` errors go back to the client.
 */
export async function checkAuthorize(p: Params): Promise<
  { ok: AuthorizeRequest } | { fatal: string } | { redirect: string }
> {
  const client = p.client_id ? await getOAuthClient(p.client_id) : null;
  if (!client) return { fatal: "This app isn't registered with Tadaa. Try adding the connector again." };
  const redirectUri = p.redirect_uri || (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { fatal: "The return address for this app doesn't match its registration." };
  }
  const back = (error: string, description: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (p.state) u.searchParams.set("state", p.state);
    return { redirect: u.toString() };
  };
  if (p.response_type !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
  if (!p.code_challenge || (p.code_challenge_method && p.code_challenge_method !== "S256")) {
    return back("invalid_request", "PKCE with S256 is required.");
  }
  return {
    ok: {
      client,
      redirectUri,
      state: p.state ?? "",
      codeChallenge: p.code_challenge,
      scope: SCOPE,
    },
  };
}

export function friendlyClientName(name: string) {
  return /claude/i.test(name) ? "Claude" : name;
}
