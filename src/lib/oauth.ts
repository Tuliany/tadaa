import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR, getOAuthToken, getUser, saveOAuthTokens } from "./db";
import { publicOrigin } from "./email";

/**
 * OAuth 2.1 authorization server for connectors (Claude and other MCP clients).
 * Public clients with PKCE (S256), dynamic client registration, rotating refresh tokens.
 */

export const SCOPE = "tadaa";
export const ACCESS_TTL_S = 60 * 60; // 1 hour
const REFRESH_TTL_S = 90 * 86400; // 90 days
export const CODE_TTL_S = 5 * 60;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

export function origin(req: Request) {
  return publicOrigin(req);
}

export function mcpResource(req: Request) {
  return `${origin(req)}/mcp`;
}

export function protectedResourceMetadataUrl(req: Request) {
  return `${origin(req)}/.well-known/oauth-protected-resource/mcp`;
}

/** Redirect URIs must be https, or http on the local machine (desktop apps and CLIs). */
export function validRedirectUri(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function pkceMatches(verifier: string, challenge: string) {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueTokens(userId: string, clientId: string, scope: string) {
  const access = newToken("tda");
  const refresh = newToken("tdr");
  const now = Date.now();
  await saveOAuthTokens([
    {
      tokenHash: sha256(access),
      kind: "access",
      clientId,
      userId,
      scope,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    },
    {
      tokenHash: sha256(refresh),
      kind: "refresh",
      clientId,
      userId,
      scope,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + REFRESH_TTL_S * 1000).toISOString(),
    },
  ]);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
    scope,
  };
}

/** Resolve the user behind an `Authorization: Bearer` header, or null. */
export async function bearerUser(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return null;
  const token = await getOAuthToken(sha256(m[1]), "access");
  if (!token) return null;
  const user = await getUser(token.userId);
  return user ? { user, token } : null;
}

export function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } },
  );
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};

// ---------- Signed download links ----------

let secret: Buffer | null = null;

/** A server secret kept on the data volume, so signed links survive redeploys. */
async function serverSecret() {
  if (secret) return secret;
  if (process.env.TADAA_SECRET) return (secret = Buffer.from(process.env.TADAA_SECRET));
  const file = path.join(DATA_DIR, "secret.key");
  try {
    secret = await fs.readFile(file);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const fresh = randomBytes(32);
    try {
      await fs.writeFile(file, fresh, { flag: "wx" });
      secret = fresh;
    } catch {
      secret = await fs.readFile(file);
    }
  }
  return secret;
}

export async function signDownload(reelId: string, ttlDays = 7) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const sig = createHmac("sha256", await serverSecret()).update(`dl:${reelId}:${exp}`).digest("base64url");
  return `exp=${exp}&sig=${sig}`;
}

export async function verifyDownload(reelId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = createHmac("sha256", await serverSecret()).update(`dl:${reelId}:${exp}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Encryption at rest (third-party tokens) ----------

async function encryptionKey() {
  return createHash("sha256").update(Buffer.concat([Buffer.from("tadaa-enc:"), await serverSecret()])).digest();
}

/** AES-256-GCM. Output: base64url(iv | tag | ciphertext). */
export async function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export async function decrypt(enc: string) {
  const buf = Buffer.from(enc, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", await encryptionKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
