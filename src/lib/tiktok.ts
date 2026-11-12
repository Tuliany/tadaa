import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import { getConnection, saveConnection } from "./db";
import { decrypt, encrypt } from "./oauth";
import type { SocialConnection } from "./types";

/**
 * TikTok Login Kit (web) + Content Posting API (Direct Post).
 * Docs: developers.tiktok.com – Login Kit for Web, Manage user access tokens, Content Posting API.
 */

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
// TIKTOK_API_BASE exists only for local testing against a mock server.
const API = process.env.TIKTOK_API_BASE || "https://open.tiktokapis.com/v2";
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];

export function tiktokConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

function creds() {
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!key || !secret) throw new TikTokError("TikTok isn't set up on this server yet.");
  return { key, secret };
}

export class TikTokError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "TikTokError";
  }
}

export function redirectUri(origin: string) {
  return `${origin}/api/connect/tiktok/callback`;
}

export function authorizeUrl(origin: string, state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_key", creds().key);
  u.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>) {
  const { key, secret } = creds();
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({ client_key: key, client_secret: secret, ...params }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new TikTokError(data.error_description || data.error || `TikTok sign-in failed (${res.status})`, data.error);
  }
  return data;
}

export function exchangeCode(code: string, origin: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
}

export async function revokeToken(accessToken: string) {
  const { key, secret } = creds();
  await fetch(`${API}/oauth/revoke/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: key, client_secret: secret, token: accessToken }),
  }).catch(() => {});
}

/** Calls an Open API endpoint; TikTok wraps results as { data, error: { code, message } }. */
async function call<T>(token: string, path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  // Post ids are 64-bit integers – keep them as strings so JavaScript doesn't round them.
  const text = (await res.text()).replace(/("publicaly_available_post_id"\s*:\s*\[)([^\]]*)\]/g, (_m, open: string, ids: string) =>
    `${open}${ids
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (x.startsWith('"') ? x : `"${x}"`))
      .join(",")}]`,
  );
  let json: { data?: T; error?: { code?: string; message?: string } } = {};
  try {
    json = JSON.parse(text);
  } catch {}
  const code = json.error?.code;
  if (!res.ok || (code && code !== "ok")) {
    throw new TikTokError(friendlyError(code, json.error?.message) ?? `TikTok request failed (${res.status})`, code);
  }
  return json.data as T;
}

function friendlyError(code?: string, message?: string) {
  switch (code) {
    case "access_token_invalid":
    case "scope_not_authorized":
      return "TikTok needs you to reconnect your account (Accounts → TikTok).";
    case "spam_risk_too_many_posts":
      return "TikTok's daily posting limit for this account has been reached. Try again tomorrow.";
    case "spam_risk_user_banned_from_posting":
      return "This TikTok account is currently not allowed to post.";
    case "privacy_level_option_mismatch":
      return "That privacy setting isn't available for this account any more. Pick another one.";
    case "unaudited_client_can_only_post_to_private_accounts":
      return "Until TikTok approves Tadaa, posts can only be visible to you (\"Only me\"), or the account must be private.";
    case "rate_limit_exceeded":
      return "TikTok is busy. Try again in a minute.";
    default:
      return message || code;
  }
}

// ---------- Connections ----------

export async function saveTikTokConnection(brandId: string, ownerId: string, t: TokenResponse) {
  const info = await call<{ user: { open_id: string; display_name?: string; avatar_url?: string } }>(t.access_token, "/user/info/", {
    method: "GET",
    query: { fields: "open_id,display_name,avatar_url" },
  }).catch(() => ({ user: { open_id: t.open_id, display_name: undefined, avatar_url: undefined } }));
  const now = Date.now();
  const existing = await getConnection(brandId, "tiktok");
  const conn: SocialConnection = {
    id: existing?.id ?? nanoid(10),
    brandId,
    ownerId,
    provider: "tiktok",
    accountId: t.open_id,
    displayName: info.user.display_name || "TikTok account",
    avatarUrl: info.user.avatar_url,
    scope: t.scope,
    accessTokenEnc: await encrypt(t.access_token),
    refreshTokenEnc: await encrypt(t.refresh_token),
    accessExpiresAt: new Date(now + t.expires_in * 1000).toISOString(),
    refreshExpiresAt: new Date(now + t.refresh_expires_in * 1000).toISOString(),
    createdAt: existing?.createdAt ?? new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  return saveConnection(conn);
}

/** A valid access token for the brand's TikTok account, refreshing it if it's about to expire. */
export async function accessToken(conn: SocialConnection) {
  if (Date.parse(conn.accessExpiresAt) - Date.now() > 5 * 60_000) return decrypt(conn.accessTokenEnc);
  if (Date.parse(conn.refreshExpiresAt) < Date.now()) {
    throw new TikTokError("The TikTok connection has expired. Reconnect it under Accounts.", "refresh_expired");
  }
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: await decrypt(conn.refreshTokenEnc) });
  const now = Date.now();
  await saveConnection({
    ...conn,
    scope: t.scope || conn.scope,
    accessTokenEnc: await encrypt(t.access_token),
    refreshTokenEnc: await encrypt(t.refresh_token),
    accessExpiresAt: new Date(now + t.expires_in * 1000).toISOString(),
    refreshExpiresAt: new Date(now + t.refresh_expires_in * 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
  });
  return t.access_token;
}

// ---------- Content Posting API (Direct Post) ----------

export interface CreatorInfo {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

export function creatorInfo(token: string) {
  return call<CreatorInfo>(token, "/post/publish/creator_info/query/");
}

export interface PostSettings {
  title: string;
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Commercial content disclosure. */
  yourBrand: boolean;
  brandedContent: boolean;
}

const MB = 1024 * 1024;

/** TikTok's chunk rules: one chunk up to 64 MB; otherwise 10 MB chunks, the last one taking the remainder. */
export function chunkPlan(size: number) {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

export async function publishVideo(token: string, file: string, s: PostSettings) {
  const { size } = await fs.stat(file);
  const { chunkSize, count } = chunkPlan(size);
  const init = await call<{ publish_id: string; upload_url: string }>(token, "/post/publish/video/init/", {
    body: {
      post_info: {
        title: s.title,
        privacy_level: s.privacyLevel,
        disable_comment: !s.allowComment,
        disable_duet: !s.allowDuet,
        disable_stitch: !s.allowStitch,
        video_cover_timestamp_ms: 1000,
        brand_content_toggle: s.brandedContent,
        brand_organic_toggle: s.yourBrand,
      },
      source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: count },
    },
  });
  const handle = await fs.open(file, "r");
  try {
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? size - 1 : start + chunkSize - 1;
      const buf = Buffer.alloc(end - start + 1);
      await handle.read(buf, 0, buf.length, start);
      const res = await fetch(init.upload_url, {
        method: "PUT",
        headers: {
          "content-type": "video/mp4",
          "content-length": String(buf.length),
          "content-range": `bytes ${start}-${end}/${size}`,
        },
        body: new Uint8Array(buf),
      });
      if (!res.ok) throw new TikTokError(`Uploading the video to TikTok failed (${res.status}).`);
    }
  } finally {
    await handle.close();
  }
  return init.publish_id;
}

export interface PublishStatus {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED";
  fail_reason?: string;
  publicaly_available_post_id?: (string | number)[];
}

export function publishStatus(token: string, publishId: string) {
  return call<PublishStatus>(token, "/post/publish/status/fetch/", { body: { publish_id: publishId } });
}
