import { nanoid } from "nanoid";
import { getConnection, saveConnection } from "./db";
import { creds2 as creds, graph, MetaError } from "./meta";
import { encrypt } from "./oauth";
import type { MetaPage, SocialConnection } from "./types";

/**
 * "Connect Instagram" – Meta's Instagram API with Unified Login.
 * The person logs in with Instagram (or Facebook); no Facebook Page is needed.
 * Login uses a Facebook Login for Business configuration with a system-user token that doesn't expire,
 * scoped to the Instagram professional account(s) they choose. Publishing uses the same graph.facebook.com
 * endpoints as Page-linked Instagram, so each account is stored in the same shape as a Page's Instagram.
 */

export function instagramConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_IG_CONFIG_ID);
}

export function redirectUri(origin: string) {
  return `${origin}/api/connect/instagram/callback`;
}

/** Same parameters as the login URL Meta's dashboard generates for Unified login. */
export function authorizeUrl(origin: string, state: string) {
  const u = new URL("https://www.facebook.com/dialog/oauth");
  u.searchParams.set("client_id", creds().id);
  u.searchParams.set("config_id", process.env.META_IG_CONFIG_ID ?? "");
  u.searchParams.set("override_default_response_type", "true");
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  // Shows the login choice (Instagram or Facebook) instead of continuing as whoever is logged in to Facebook.
  u.searchParams.set("prompt", "login");
  return u.toString();
}

export async function exchangeCode(code: string, origin: string) {
  const { id, secret } = creds();
  const res = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    params: { client_id: id, client_secret: secret, redirect_uri: redirectUri(origin), code },
  });
  return res.access_token;
}

interface IgAccount {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}

/** The Instagram accounts the person shared. */
async function findAccounts(token: string): Promise<IgAccount[]> {
  const fields = "id,username,name,profile_picture_url";
  try {
    const res = await graph<{ data: IgAccount[] }>("/me/assigned_instagram_accounts", { token, params: { fields, limit: "50" } });
    if (res.data?.length) return res.data;
  } catch (e) {
    console.warn("[instagram] assigned_instagram_accounts failed", (e as Error).message);
  }
  // Fallback: the token's granted targets (e.g. when the account sits in the app's own business portfolio).
  const { id, secret } = creds();
  const dbg = await graph<{ data: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>("/debug_token", {
    params: { input_token: token, access_token: `${id}|${secret}` },
  });
  const ids = new Set(
    (dbg.data.granular_scopes ?? [])
      .filter((g) => g.scope === "instagram_basic" || g.scope === "instagram_content_publish")
      .flatMap((g) => g.target_ids ?? []),
  );
  const out: IgAccount[] = [];
  for (const igId of ids) {
    try {
      out.push(await graph<IgAccount>(`/${igId}`, { token, params: { fields } }));
    } catch {}
  }
  return out;
}

export async function saveInstagramConnection(brandId: string, ownerId: string, token: string) {
  const accounts = await findAccounts(token);
  const tokenEnc = await encrypt(token);
  const pages: MetaPage[] = accounts.map((a) => ({
    id: a.id,
    name: a.username ? `@${a.username}` : a.name || "Instagram account",
    pictureUrl: a.profile_picture_url,
    tokenEnc,
    igId: a.id,
    igUsername: a.username,
    igPictureUrl: a.profile_picture_url,
  }));
  const existing = await getConnection(brandId, "instagram");
  const keep = existing?.selectedPageId && pages.some((p) => p.id === existing.selectedPageId) ? existing.selectedPageId : undefined;
  const now = new Date().toISOString();
  const first = pages.find((p) => p.id === keep) ?? pages[0];
  const conn: SocialConnection = {
    id: existing?.id ?? nanoid(10),
    brandId,
    ownerId,
    provider: "instagram",
    accountId: first?.igId ?? "",
    displayName: first?.name ?? "Instagram",
    avatarUrl: first?.pictureUrl,
    scope: "instagram_basic,instagram_content_publish",
    accessTokenEnc: tokenEnc,
    refreshTokenEnc: "",
    // System-user tokens from Unified login don't expire.
    accessExpiresAt: "9999-12-31T00:00:00.000Z",
    refreshExpiresAt: "9999-12-31T00:00:00.000Z",
    pages,
    selectedPageId: first?.id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return saveConnection(conn);
}

export function selectedAccount(conn: SocialConnection) {
  const acc = conn.pages?.find((p) => p.id === conn.selectedPageId);
  if (!acc) throw new MetaError("Choose which Instagram account to post to (Accounts → Instagram).");
  return acc;
}
