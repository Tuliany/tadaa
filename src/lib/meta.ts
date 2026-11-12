import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import { getConnection, saveConnection } from "./db";
import { decrypt, encrypt } from "./oauth";
import type { MetaPage, SocialConnection } from "./types";

/**
 * Facebook Login + Pages API + Instagram API with Facebook Login.
 * One Meta login gives the brand's Facebook Page and the Instagram professional account linked to it.
 */

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
// META_GRAPH_BASE / META_RUPLOAD_BASE exist only for local testing against a mock server.
const GRAPH = process.env.META_GRAPH_BASE || `https://graph.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD = process.env.META_RUPLOAD_BASE || "https://rupload.facebook.com";

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

export class MetaError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

export function metaConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function creds() {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new MetaError("Facebook and Instagram aren't set up on this server yet.");
  return { id, secret };
}

export function redirectUri(origin: string) {
  return `${origin}/api/connect/meta/callback`;
}

export function authorizeUrl(origin: string, state: string) {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", creds().id);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  // Facebook Login for Business uses a saved configuration; classic Facebook Login uses scopes.
  if (process.env.META_LOGIN_CONFIG_ID) u.searchParams.set("config_id", process.env.META_LOGIN_CONFIG_ID);
  else u.searchParams.set("scope", META_SCOPES.join(","));
  return u.toString();
}

function friendly(message?: string, code?: number) {
  if (code === 190) return "The Facebook connection has expired. Reconnect it under Accounts.";
  if (code === 10 || code === 200) return "Facebook didn't give Tadaa permission to do that. Reconnect and allow all the requested permissions.";
  if (code === 9 || code === 4 || code === 32) return "Facebook/Instagram is limiting requests right now. Try again in a few minutes.";
  return message || "Facebook request failed.";
}

async function graph<T>(path: string, init: { method?: string; params?: Record<string, string>; token?: string } = {}) {
  const url = new URL(`${GRAPH}${path}`);
  const body = new URLSearchParams(init.params ?? {});
  const method = init.method ?? "GET";
  if (method === "GET") body.forEach((v, k) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: {
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(method === "GET" ? {} : { "content-type": "application/x-www-form-urlencoded" }),
    },
    body: method === "GET" ? undefined : body,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_user_msg?: string } };
  if (!res.ok || json.error) throw new MetaError(friendly(json.error?.error_user_msg || json.error?.message, json.error?.code), json.error?.code);
  return json as T;
}

// ---------- Connecting ----------

export async function exchangeCode(code: string, origin: string) {
  const { id, secret } = creds();
  const short = await graph<{ access_token: string }>("/oauth/access_token", {
    params: { client_id: id, client_secret: secret, redirect_uri: redirectUri(origin), code },
  });
  // Long-lived user token (~60 days); Page tokens derived from it don't expire.
  const long = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token },
  });
  return { token: long.access_token, expiresIn: long.expires_in ?? 60 * 86400 };
}

interface PagesResponse {
  data: {
    id: string;
    name: string;
    access_token: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
  }[];
}

export async function fetchPages(userToken: string): Promise<MetaPage[]> {
  const res = await graph<PagesResponse>("/me/accounts", {
    token: userToken,
    params: { fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}", limit: "100" },
  });
  return Promise.all(
    res.data.map(async (p) => ({
      id: p.id,
      name: p.name,
      pictureUrl: p.picture?.data?.url,
      tokenEnc: await encrypt(p.access_token),
      igId: p.instagram_business_account?.id,
      igUsername: p.instagram_business_account?.username,
      igPictureUrl: p.instagram_business_account?.profile_picture_url,
    })),
  );
}

export async function saveMetaConnection(brandId: string, ownerId: string, token: string, expiresIn: number) {
  const me = await graph<{ id: string; name?: string }>("/me", { token, params: { fields: "id,name" } });
  const pages = await fetchPages(token);
  const existing = await getConnection(brandId, "meta");
  const keep = existing?.selectedPageId && pages.some((p) => p.id === existing.selectedPageId) ? existing.selectedPageId : undefined;
  // One Page: pick it. Several: prefer one with Instagram linked, but let the user change it.
  const selected = keep ?? (pages.length === 1 ? pages[0].id : (pages.find((p) => p.igId) ?? pages[0])?.id);
  const now = Date.now();
  const expires = new Date(now + expiresIn * 1000).toISOString();
  const conn: SocialConnection = {
    id: existing?.id ?? nanoid(10),
    brandId,
    ownerId,
    provider: "meta",
    accountId: me.id,
    displayName: me.name || "Facebook account",
    scope: META_SCOPES.join(","),
    accessTokenEnc: await encrypt(token),
    refreshTokenEnc: "",
    accessExpiresAt: expires,
    refreshExpiresAt: expires,
    pages,
    selectedPageId: selected,
    createdAt: existing?.createdAt ?? new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  return saveConnection(conn);
}

export async function revoke(conn: SocialConnection) {
  try {
    await graph("/me/permissions", { method: "DELETE", token: await decrypt(conn.accessTokenEnc) });
  } catch {}
}

export function selectedPage(conn: SocialConnection) {
  const page = conn.pages?.find((p) => p.id === conn.selectedPageId);
  if (!page) throw new MetaError("Choose which Facebook Page to post to (Accounts → Facebook).");
  return page;
}

// ---------- Publishing ----------

async function ruploadFile(url: string, token: string, file: string) {
  const data = await fs.readFile(file);
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `OAuth ${token}`, offset: "0", file_size: String(data.length), "content-type": "application/octet-stream" },
    body: new Uint8Array(data),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } | string; debug_info?: { message?: string } };
  if (!res.ok || json.success === false) {
    const msg = typeof json.error === "string" ? json.error : json.error?.message || json.debug_info?.message;
    throw new MetaError(`Uploading the video failed${msg ? `: ${msg}` : ` (${res.status})`}.`);
  }
}

/** Instagram Reel: create a resumable container, upload the file. Publishing happens once processing finishes. */
export async function startInstagramReel(page: MetaPage, file: string, caption: string, shareToFeed: boolean) {
  if (!page.igId) throw new MetaError("This Facebook Page has no Instagram professional account linked.");
  const token = await decrypt(page.tokenEnc);
  const container = await graph<{ id: string; uri?: string }>(`/${page.igId}/media`, {
    method: "POST",
    token,
    params: { media_type: "REELS", upload_type: "resumable", caption, share_to_feed: String(shareToFeed) },
  });
  await ruploadFile(container.uri || `${RUPLOAD}/ig-api-upload/${GRAPH_VERSION}/${container.id}`, token, file);
  return container.id;
}

/** Checks an Instagram container; publishes it when it's ready. */
export async function advanceInstagramReel(page: MetaPage, containerId: string) {
  const token = await decrypt(page.tokenEnc);
  const st = await graph<{ status_code?: string; status?: string }>(`/${containerId}`, { token, params: { fields: "status_code,status" } });
  if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
    return { state: "failed" as const, error: st.status || "Instagram couldn't process the video." };
  }
  if (st.status_code !== "FINISHED") return { state: "processing" as const };
  const published = await graph<{ id: string }>(`/${page.igId}/media_publish`, { method: "POST", token, params: { creation_id: containerId } });
  const media = await graph<{ permalink?: string }>(`/${published.id}`, { token, params: { fields: "permalink" } }).catch(() => ({ permalink: undefined }));
  return { state: "published" as const, postId: published.id, permalink: media.permalink };
}

/** Facebook Page Reel: start, upload, finish (published). */
export async function publishFacebookReel(page: MetaPage, file: string, description: string) {
  const token = await decrypt(page.tokenEnc);
  const start = await graph<{ video_id: string; upload_url?: string }>(`/${page.id}/video_reels`, {
    method: "POST",
    token,
    params: { upload_phase: "start" },
  });
  await ruploadFile(start.upload_url || `${RUPLOAD}/video-upload/${GRAPH_VERSION}/${start.video_id}`, token, file);
  await graph(`/${page.id}/video_reels`, {
    method: "POST",
    token,
    params: { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description },
  });
  return start.video_id;
}

export async function facebookReelStatus(page: MetaPage, videoId: string) {
  const token = await decrypt(page.tokenEnc);
  const v = await graph<{ status?: { video_status?: string; publishing_phase?: { status?: string; errors?: { message?: string }[] } }; permalink_url?: string }>(
    `/${videoId}`,
    { token, params: { fields: "status,permalink_url" } },
  );
  const phase = v.status?.publishing_phase?.status;
  if (v.status?.video_status === "error" || phase === "error") {
    return { state: "failed" as const, error: v.status?.publishing_phase?.errors?.[0]?.message || "Facebook couldn't publish the video." };
  }
  if (phase === "complete" || v.status?.video_status === "ready") {
    const link = v.permalink_url ? (v.permalink_url.startsWith("http") ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : undefined;
    return { state: "published" as const, permalink: link };
  }
  return { state: "processing" as const };
}
