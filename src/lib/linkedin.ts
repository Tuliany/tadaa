import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import { getConnection, saveConnection } from "./db";
import { decrypt, encrypt } from "./oauth";
import type { SocialConnection } from "./types";

/**
 * LinkedIn posting: Videos API (initialize → upload parts → finalize) → Posts API.
 * Two apps are supported:
 *  - "pages" (LINKEDIN_PAGES_CLIENT_ID/SECRET): Community Management API – posts to the member's profile
 *    or to a company page they administer (w_organization_social). Preferred when configured.
 *  - "member" (LINKEDIN_CLIENT_ID/SECRET): OpenID + Share on LinkedIn – the member's own profile only.
 */

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
// LINKEDIN_API_BASE exists only for local testing against a mock server.
const API = process.env.LINKEDIN_API_BASE || "https://api.linkedin.com";
const VERSION = process.env.LINKEDIN_API_VERSION || "202610";
const MEMBER_SCOPES = ["openid", "profile", "w_member_social"];
const PAGES_SCOPES = ["r_basicprofile", "w_member_social", "w_organization_social", "rw_organization_admin"];
export const LINKEDIN_SCOPES = MEMBER_SCOPES;

type App = "pages" | "member";
const pagesApp = () => Boolean(process.env.LINKEDIN_PAGES_CLIENT_ID && process.env.LINKEDIN_PAGES_CLIENT_SECRET);
/** The app new connections use. */
export const currentApp = (): App => (pagesApp() ? "pages" : "member");
/** True when Tadaa can post to company pages. */
export const companyPagesEnabled = () => pagesApp();

export class LinkedInError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "LinkedInError";
  }
}

export function linkedinConfigured() {
  return pagesApp() || Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

function creds(app: App = currentApp()) {
  const id = app === "pages" ? process.env.LINKEDIN_PAGES_CLIENT_ID : process.env.LINKEDIN_CLIENT_ID;
  const secret = app === "pages" ? process.env.LINKEDIN_PAGES_CLIENT_SECRET : process.env.LINKEDIN_CLIENT_SECRET;
  if (!id || !secret) throw new LinkedInError("LinkedIn isn't set up on this server yet.");
  return { id, secret };
}

export function redirectUri(origin: string) {
  return `${origin}/api/connect/linkedin/callback`;
}

export function authorizeUrl(origin: string, state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", creds().id);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", state);
  u.searchParams.set("scope", (currentApp() === "pages" ? PAGES_SCOPES : MEMBER_SCOPES).join(" "));
  return u.toString();
}

function friendly(status: number, message?: string) {
  if (status === 401) return "The LinkedIn connection has expired. Reconnect it under Accounts.";
  if (status === 403) return "LinkedIn didn't give Tadaa permission to do that. Reconnect and allow posting.";
  if (status === 429) return "LinkedIn is limiting requests right now. Try again in a few minutes.";
  return message || `LinkedIn request failed (${status}).`;
}

async function api<T>(path: string, token: string, init: { method?: string; json?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "linkedin-version": VERSION,
      "x-restli-protocol-version": "2.0.0",
      ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T & { message?: string });
  if (!res.ok) throw new LinkedInError(friendly(res.status, json.message), res.status);
  return { json, res };
}

// ---------- Connecting ----------

export async function exchangeCode(code: string, origin: string) {
  const { id, secret } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin), client_id: id, client_secret: secret }),
  });
  const t = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
    error_description?: string;
  };
  if (!res.ok || !t.access_token) throw new LinkedInError(t.error_description || "LinkedIn didn't accept the login. Please try again.");
  return t as Required<Pick<typeof t, "access_token" | "expires_in">> & typeof t;
}

export async function saveLinkedInConnection(
  brandId: string,
  ownerId: string,
  t: { access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string },
) {
  const app = currentApp();
  const me = app === "pages" ? await basicProfile(t.access_token) : (await api<{ sub: string; name?: string; picture?: string }>("/v2/userinfo", t.access_token)).json;
  const orgs = app === "pages" ? await companyPages(t.access_token).catch(() => []) : [];
  const now = Date.now();
  const existing = await getConnection(brandId, "linkedin");
  // Keep the brand's choice if that page is still available; a single page is picked automatically.
  const keep = existing?.selectedPageId && orgs.some((o) => o.id === existing.selectedPageId) ? existing.selectedPageId : undefined;
  const accessExpires = new Date(now + t.expires_in * 1000).toISOString();
  const conn: SocialConnection = {
    id: existing?.id ?? nanoid(10),
    brandId,
    ownerId,
    provider: "linkedin",
    accountId: me.sub,
    displayName: me.name || "LinkedIn member",
    avatarUrl: me.picture,
    scope: t.scope || (app === "pages" ? PAGES_SCOPES : MEMBER_SCOPES).join(","),
    liApp: app,
    orgs,
    selectedPageId: keep ?? (orgs.length === 1 ? orgs[0].id : undefined),
    accessTokenEnc: await encrypt(t.access_token),
    refreshTokenEnc: t.refresh_token ? await encrypt(t.refresh_token) : "",
    accessExpiresAt: accessExpires,
    refreshExpiresAt: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : accessExpires,
    createdAt: existing?.createdAt ?? new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  return saveConnection(conn);
}

/** A valid access token (LinkedIn member tokens last 60 days; refresh tokens only exist for approved partners). */
export async function accessToken(conn: SocialConnection) {
  if (Date.parse(conn.accessExpiresAt) > Date.now() + 60_000) return decrypt(conn.accessTokenEnc);
  if (!conn.refreshTokenEnc || Date.parse(conn.refreshExpiresAt) < Date.now()) {
    throw new LinkedInError("The LinkedIn connection has expired (LinkedIn asks every 60 days). Reconnect it under Accounts.", 401);
  }
  const { id, secret } = creds(conn.liApp ?? "member");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: await decrypt(conn.refreshTokenEnc), client_id: id, client_secret: secret }),
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number };
  if (!res.ok || !t.access_token) throw new LinkedInError("The LinkedIn connection has expired. Reconnect it under Accounts.", 401);
  const now = Date.now();
  await saveConnection({
    ...conn,
    accessTokenEnc: await encrypt(t.access_token),
    refreshTokenEnc: t.refresh_token ? await encrypt(t.refresh_token) : conn.refreshTokenEnc,
    accessExpiresAt: new Date(now + (t.expires_in ?? 0) * 1000).toISOString(),
    refreshExpiresAt: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : conn.refreshExpiresAt,
    updatedAt: new Date(now).toISOString(),
  });
  return t.access_token;
}

export async function revoke(conn: SocialConnection) {
  try {
    const { id, secret } = creds(conn.liApp ?? "member");
    await fetch("https://www.linkedin.com/oauth/v2/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, token: await decrypt(conn.accessTokenEnc) }),
    });
  } catch {}
}

/** Name and photo of the member (r_basicprofile; the Pages app has no OpenID). */
async function basicProfile(token: string) {
  const { json } = await api<{
    id: string;
    localizedFirstName?: string;
    localizedLastName?: string;
    profilePicture?: { "displayImage~"?: { elements?: { identifiers?: { identifier: string }[] }[] } };
  }>("/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))", token);
  const pics = json.profilePicture?.["displayImage~"]?.elements ?? [];
  const picture = pics[pics.length - 1]?.identifiers?.[0]?.identifier;
  return { sub: json.id, name: [json.localizedFirstName, json.localizedLastName].filter(Boolean).join(" ") || undefined, picture };
}

/** Company pages where the member can post (page admins and content admins). */
export async function companyPages(token: string) {
  const { json } = await api<{ elements?: { organization: string; role: string; state: string }[] }>(
    "/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100",
    token,
  );
  const ids = [
    ...new Set(
      (json.elements ?? [])
        .filter((e) => ["ADMINISTRATOR", "CONTENT_ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER"].includes(e.role))
        .map((e) => e.organization.split(":").pop()!)
        .filter(Boolean),
    ),
  ].slice(0, 50);
  const pages = await Promise.all(
    ids.map(async (id) => {
      try {
        const { json: o } = await api<{ localizedName?: string; vanityName?: string }>(`/rest/organizations/${id}`, token);
        return { id, name: o.localizedName || o.vanityName || `Company page ${id}` };
      } catch {
        return { id, name: `Company page ${id}` };
      }
    }),
  );
  return pages.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Publishing ----------

/**
 * Posts commentary uses LinkedIn's "little text format": these characters must be escaped.
 * Hashtags become hashtag templates so they stay clickable.
 */
export function commentary(text: string) {
  const esc = (t: string) => t.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out.push(esc(text.slice(last, m.index)), `{hashtag|\\#|${m[1]}}`);
    last = m.index! + m[0].length;
  }
  out.push(esc(text.slice(last)));
  return out.join("");
}

interface UploadInstruction {
  uploadUrl: string;
  firstByte: number;
  lastByte: number;
}

/** Who the post is published as: the selected company page, or the member's own profile. */
export function authorOf(conn: SocialConnection) {
  const org = conn.selectedPageId ? conn.orgs?.find((o) => o.id === conn.selectedPageId) : undefined;
  return org
    ? { urn: `urn:li:organization:${org.id}`, name: org.name, kind: "page" as const }
    : { urn: `urn:li:person:${conn.accountId}`, name: conn.displayName, kind: "profile" as const };
}

/** Uploads the video and creates the post. Returns the post URN and video URN. */
export async function publishVideo(conn: SocialConnection, token: string, file: string, text: string, title: string) {
  const author = authorOf(conn).urn;
  const data = await fs.readFile(file);
  const { json: init } = await api<{ value: { video: string; uploadInstructions: UploadInstruction[]; uploadToken?: string } }>(
    "/rest/videos?action=initializeUpload",
    token,
    { method: "POST", json: { initializeUploadRequest: { owner: author, fileSizeBytes: data.length, uploadCaptions: false, uploadThumbnail: false } } },
  );
  const etags: string[] = [];
  for (const part of init.value.uploadInstructions) {
    const res = await fetch(part.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: data.subarray(part.firstByte, part.lastByte + 1),
    });
    if (!res.ok) throw new LinkedInError(`Uploading the video to LinkedIn failed (${res.status}).`, res.status);
    etags.push((res.headers.get("etag") ?? "").replace(/"/g, ""));
  }
  await api("/rest/videos?action=finalizeUpload", token, {
    method: "POST",
    json: { finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken ?? "", uploadedPartIds: etags } },
  });
  const { res } = await api("/rest/posts", token, {
    method: "POST",
    json: {
      author,
      commentary: commentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { title: title.slice(0, 200), id: init.value.video } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    },
  });
  const postUrn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id") ?? "";
  return { postUrn, videoUrn: init.value.video };
}

/** Video processing state; the post shows the video once it's AVAILABLE. */
export async function videoStatus(token: string, videoUrn: string) {
  const { json } = await api<{ status?: string }>(`/rest/videos/${encodeURIComponent(videoUrn)}`, token);
  if (json.status === "AVAILABLE") return { state: "published" as const };
  if (json.status === "PROCESSING_FAILED") return { state: "failed" as const, error: "LinkedIn couldn't process the video." };
  return { state: "processing" as const };
}

export function postUrl(postUrn: string) {
  return postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : undefined;
}
