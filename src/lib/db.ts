import { deleteFile } from "./storage";
import { keyOf, store, type Tx } from "./store";
import type { Brand, MediaItem, OAuthClient, SocialConnection, SocialProvider, OAuthCode, OAuthToken, PasswordReset, Plan, Reel, Session, User } from "./types";

/**
 * Data access for the whole app. Backed by Postgres in production (DATABASE_URL)
 * and by a JSON file locally – see ./store.ts.
 */

export { DATA_DIR } from "./store";

const db = () => store();
const newestFirst = <T extends { createdAt: string }>(list: T[]) => list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const live = <T extends { expiresAt: string }>(x: T | null) => (x && x.expiresAt > new Date().toISOString() ? x : null);

// Users & sessions
export async function getUserByEmail(email: string) {
  return db().get<User>("users", { email: email.toLowerCase() });
}
export async function getUser(id: string) {
  return db().get<User>("users", { id });
}
export function createUser(user: User) {
  return db().tx(async (t) => {
    if (await t.get("users", { email: user.email })) throw new Error("EMAIL_TAKEN");
    // Brands created before accounts existed belong to the very first account.
    if (!(await t.find("users")).length) {
      for (const b of await t.find<Brand>("brands")) if (!b.ownerId) await t.put("brands", b.id, { ...b, ownerId: user.id });
    }
    await t.put("users", user.id, user);
    return user;
  });
}
export function setPassword(userId: string, passwordHash: string) {
  return db().tx(async (t) => {
    const u = await t.get<User>("users", { id: userId });
    if (!u) throw new Error("NO_USER");
    await t.put("users", u.id, { ...u, passwordHash });
    // Log out everywhere and burn any other reset links.
    await t.del("sessions", { userId });
    await t.del("resets", { userId });
    await t.del("oauthTokens", { userId });
  });
}
export function saveReset(reset: PasswordReset) {
  return db().tx(async (t) => {
    await t.delExpired("resets");
    await t.del("resets", { userId: reset.userId });
    await t.put("resets", keyOf("resets", { ...reset }), reset);
  });
}
export async function getReset(tokenHash: string) {
  return live(await db().get<PasswordReset>("resets", { tokenHash }));
}

export async function saveSession(session: Session) {
  // Clean up now and then rather than on every login.
  if (Math.random() < 0.05) await db().delExpired("sessions");
  await db().put("sessions", session.tokenHash, session);
}
export async function getSession(tokenHash: string) {
  return live(await db().get<Session>("sessions", { tokenHash }));
}
export function deleteSession(tokenHash: string) {
  return db().del("sessions", { tokenHash });
}

/** Remove a user and everything they own. Returns stored file names so the caller can delete the files. */
export function deleteUserCascade(userId: string) {
  return db().tx(async (t) => {
    const brands = await t.find<Brand>("brands", { ownerId: userId });
    const uploads: string[] = [];
    const renders: string[] = [];
    for (const b of brands) {
      uploads.push(...(await t.find<MediaItem>("media", { brandId: b.id })).map((m) => m.fileName));
      renders.push(...(await t.find<Reel>("reels", { brandId: b.id })).filter((r) => r.renderFile).map((r) => r.renderFile!));
      for (const c of ["media", "reels", "plans", "connections"] as const) await t.del(c, { brandId: b.id });
      await t.del("brands", { id: b.id });
    }
    await t.del("users", { id: userId });
    for (const c of ["sessions", "resets", "oauthCodes", "oauthTokens"] as const) await t.del(c, { userId });
    await t.del("connections", { ownerId: userId });
    return { uploads, renders, brands: brands.length };
  });
}

// Brands
export async function listBrands(ownerId: string) {
  return newestFirst(await db().find<Brand>("brands", { ownerId }));
}
export async function getBrand(id: string) {
  return db().get<Brand>("brands", { id });
}
export async function saveBrand(brand: Brand) {
  await db().put("brands", brand.id, brand);
  return brand;
}

// Media
export async function listMedia(brandId: string) {
  return newestFirst(await db().find<MediaItem>("media", { brandId }));
}
export async function getMedia(id: string) {
  return db().get<MediaItem>("media", { id });
}
export async function saveMedia(item: MediaItem) {
  await db().put("media", item.id, item);
  return item;
}

// Reels
export async function listReels(brandId: string) {
  return newestFirst(await db().find<Reel>("reels", { brandId }));
}
export async function getReel(id: string) {
  return db().get<Reel>("reels", { id });
}
export async function saveReel(reel: Reel) {
  const before = await getReel(reel.id);
  await db().put("reels", reel.id, reel);
  // An edit or a new render makes the old MP4 useless; don't keep paying to store it.
  if (before?.renderFile && before.renderFile !== reel.renderFile) deleteFile("renders", before.renderFile).catch(() => {});
  return reel;
}

// Plans
export async function getPlan(brandId: string) {
  return db().get<Plan>("plans", { brandId });
}
export async function savePlan(plan: Plan) {
  await db().put("plans", plan.brandId, plan);
  return plan;
}

// OAuth (connectors such as Claude)
export async function saveOAuthClient(client: OAuthClient) {
  await db().put("oauthClients", client.clientId, client);
  return client;
}
export async function getOAuthClient(clientId: string) {
  return db().get<OAuthClient>("oauthClients", { clientId });
}
export function saveOAuthCode(code: OAuthCode) {
  return db().tx(async (t) => {
    await t.delExpired("oauthCodes");
    await t.put("oauthCodes", code.codeHash, code);
  });
}
/** Returns the code and deletes it, so each code works once. */
export function consumeOAuthCode(codeHash: string) {
  return db().tx(async (t) => {
    const code = await t.get<OAuthCode>("oauthCodes", { codeHash });
    if (code) await t.del("oauthCodes", { codeHash });
    return live(code);
  });
}
export function saveOAuthTokens(tokens: OAuthToken[]) {
  return db().tx(async (t: Tx) => {
    await t.delExpired("oauthTokens");
    for (const tok of tokens) await t.put("oauthTokens", keyOf("oauthTokens", { ...tok }), tok);
  });
}
export async function getOAuthToken(tokenHash: string, kind: OAuthToken["kind"]) {
  return live(await db().get<OAuthToken>("oauthTokens", { tokenHash, kind }));
}
export function deleteOAuthToken(tokenHash: string) {
  return db().del("oauthTokens", { tokenHash });
}
/** Apps the user has connected (one entry per client with a live refresh token). */
export async function listConnectedClients(userId: string) {
  const now = new Date().toISOString();
  const tokens = await db().find<OAuthToken>("oauthTokens", { userId, kind: "refresh" });
  const ids = [...new Set(tokens.filter((t) => t.expiresAt > now).map((t) => t.clientId))];
  const clients = await Promise.all(ids.map((clientId) => getOAuthClient(clientId)));
  return clients.filter((c): c is OAuthClient => !!c).map((c) => ({ clientId: c.clientId, name: c.name, createdAt: c.createdAt }));
}
export function revokeUserTokens(userId: string, clientId?: string) {
  return db().del("oauthTokens", clientId ? { userId, clientId } : { userId });
}

// Social connections (TikTok, Meta, …) – one per brand and provider
export async function getConnection(brandId: string, provider: SocialProvider) {
  return db().get<SocialConnection>("connections", { brandId, provider });
}
export async function listConnections(brandId: string) {
  return db().find<SocialConnection>("connections", { brandId });
}
export async function saveConnection(conn: SocialConnection) {
  await db().put("connections", `${conn.brandId}:${conn.provider}`, conn);
  return conn;
}
export function deleteConnection(brandId: string, provider: SocialProvider) {
  return db().del("connections", { brandId, provider });
}

// Small server settings (e.g. the signing secret)
export async function getSetting<T>(id: string) {
  return (await db().get<{ id: string; value: T }>("settings", { id }))?.value ?? null;
}
/** Stores the value unless one exists already; returns whichever is stored. */
export function initSetting<T>(id: string, value: T) {
  return db().tx(async (t) => {
    const existing = await t.get<{ id: string; value: T }>("settings", { id });
    if (existing) return existing.value;
    await t.put("settings", id, { id, value });
    return value;
  });
}
export async function setSetting<T>(id: string, value: T) {
  await db().put("settings", id, { id, value });
}
