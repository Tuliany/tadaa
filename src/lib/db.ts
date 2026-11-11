import { promises as fs } from "fs";
import path from "path";
import type { Brand, MediaItem, OAuthClient, OAuthCode, OAuthToken, PasswordReset, Plan, Reel, Session, User } from "./types";

/**
 * Local JSON-file store for development and demos.
 * Swap this module for a Supabase implementation in production;
 * the rest of the app only uses the functions exported here.
 */

export const DATA_DIR = process.env.TADAA_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface DB {
  users: User[];
  sessions: Session[];
  resets: PasswordReset[];
  brands: Brand[];
  media: MediaItem[];
  reels: Reel[];
  plans: Plan[];
  oauthClients: OAuthClient[];
  oauthCodes: OAuthCode[];
  oauthTokens: OAuthToken[];
}

const empty: DB = {
  users: [],
  sessions: [],
  resets: [],
  brands: [],
  media: [],
  reels: [],
  plans: [],
  oauthClients: [],
  oauthCodes: [],
  oauthTokens: [],
};

let queue: Promise<unknown> = Promise.resolve();

async function read(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return structuredClone(empty);
  }
}

async function write(db: DB) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

/** Serialise read-modify-write so concurrent requests don't clobber each other. */
function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const db = await read();
    const result = await fn(db);
    await write(db);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

// Users & sessions
export async function getUserByEmail(email: string) {
  return (await read()).users.find((u) => u.email === email.toLowerCase()) ?? null;
}
export async function getUser(id: string) {
  return (await read()).users.find((u) => u.id === id) ?? null;
}
export function createUser(user: User) {
  return mutate((db) => {
    if (db.users.some((u) => u.email === user.email)) throw new Error("EMAIL_TAKEN");
    // Brands created before accounts existed belong to the very first account.
    if (db.users.length === 0) for (const b of db.brands) if (!b.ownerId) b.ownerId = user.id;
    db.users.push(user);
    return user;
  });
}
export function setPassword(userId: string, passwordHash: string) {
  return mutate((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new Error("NO_USER");
    u.passwordHash = passwordHash;
    // Log out everywhere and burn any other reset links.
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    db.resets = db.resets.filter((r) => r.userId !== userId);
    db.oauthTokens = db.oauthTokens.filter((t) => t.userId !== userId);
  });
}
export function saveReset(reset: PasswordReset) {
  return mutate((db) => {
    const now = new Date().toISOString();
    db.resets = db.resets.filter((r) => r.expiresAt > now && r.userId !== reset.userId);
    db.resets.push(reset);
  });
}
export async function getReset(tokenHash: string) {
  const r = (await read()).resets.find((x) => x.tokenHash === tokenHash);
  return r && r.expiresAt > new Date().toISOString() ? r : null;
}

export function saveSession(session: Session) {
  return mutate((db) => {
    const now = new Date().toISOString();
    db.sessions = db.sessions.filter((s) => s.expiresAt > now);
    db.sessions.push(session);
  });
}
export async function getSession(tokenHash: string) {
  const s = (await read()).sessions.find((x) => x.tokenHash === tokenHash);
  return s && s.expiresAt > new Date().toISOString() ? s : null;
}
export function deleteSession(tokenHash: string) {
  return mutate((db) => {
    db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash);
  });
}

/** Remove a user and everything they own. Returns stored file names so the caller can delete them from disk. */
export function deleteUserCascade(userId: string) {
  return mutate((db) => {
    const brandIds = new Set(db.brands.filter((b) => b.ownerId === userId).map((b) => b.id));
    const uploads = db.media.filter((m) => brandIds.has(m.brandId)).map((m) => m.fileName);
    const renders = db.reels.filter((r) => brandIds.has(r.brandId) && r.renderFile).map((r) => r.renderFile as string);
    db.users = db.users.filter((u) => u.id !== userId);
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    db.resets = db.resets.filter((r) => r.userId !== userId);
    db.brands = db.brands.filter((b) => !brandIds.has(b.id));
    db.media = db.media.filter((m) => !brandIds.has(m.brandId));
    db.reels = db.reels.filter((r) => !brandIds.has(r.brandId));
    db.plans = db.plans.filter((p) => !brandIds.has(p.brandId));
    db.oauthCodes = db.oauthCodes.filter((c) => c.userId !== userId);
    db.oauthTokens = db.oauthTokens.filter((t) => t.userId !== userId);
    return { uploads, renders, brands: brandIds.size };
  });
}

// Brands
export async function listBrands(ownerId: string) {
  return (await read()).brands
    .filter((b) => b.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getBrand(id: string) {
  return (await read()).brands.find((b) => b.id === id) ?? null;
}
export function saveBrand(brand: Brand) {
  return mutate((db) => {
    const i = db.brands.findIndex((b) => b.id === brand.id);
    if (i >= 0) db.brands[i] = brand;
    else db.brands.push(brand);
    return brand;
  });
}

// Media
export async function listMedia(brandId: string) {
  return (await read()).media
    .filter((m) => m.brandId === brandId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getMedia(id: string) {
  return (await read()).media.find((m) => m.id === id) ?? null;
}
export function saveMedia(item: MediaItem) {
  return mutate((db) => {
    db.media.push(item);
    return item;
  });
}

// Reels
export async function listReels(brandId: string) {
  return (await read()).reels
    .filter((r) => r.brandId === brandId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getReel(id: string) {
  return (await read()).reels.find((r) => r.id === id) ?? null;
}
export function saveReel(reel: Reel) {
  return mutate((db) => {
    const i = db.reels.findIndex((r) => r.id === reel.id);
    if (i >= 0) db.reels[i] = reel;
    else db.reels.push(reel);
    return reel;
  });
}

// Plans
export async function getPlan(brandId: string) {
  return (await read()).plans.find((p) => p.brandId === brandId) ?? null;
}
export function savePlan(plan: Plan) {
  return mutate((db) => {
    db.plans = db.plans.filter((p) => p.brandId !== plan.brandId);
    db.plans.push(plan);
    return plan;
  });
}

// OAuth (connectors such as Claude)
export function saveOAuthClient(client: OAuthClient) {
  return mutate((db) => {
    db.oauthClients.push(client);
    return client;
  });
}
export async function getOAuthClient(clientId: string) {
  return (await read()).oauthClients.find((c) => c.clientId === clientId) ?? null;
}
export function saveOAuthCode(code: OAuthCode) {
  return mutate((db) => {
    const now = new Date().toISOString();
    db.oauthCodes = db.oauthCodes.filter((c) => c.expiresAt > now);
    db.oauthCodes.push(code);
  });
}
/** Returns the code and deletes it, so each code works once. */
export function consumeOAuthCode(codeHash: string) {
  return mutate((db) => {
    const code = db.oauthCodes.find((c) => c.codeHash === codeHash) ?? null;
    db.oauthCodes = db.oauthCodes.filter((c) => c.codeHash !== codeHash);
    return code && code.expiresAt > new Date().toISOString() ? code : null;
  });
}
export function saveOAuthTokens(tokens: OAuthToken[]) {
  return mutate((db) => {
    const now = new Date().toISOString();
    db.oauthTokens = db.oauthTokens.filter((t) => t.expiresAt > now);
    db.oauthTokens.push(...tokens);
  });
}
export async function getOAuthToken(tokenHash: string, kind: OAuthToken["kind"]) {
  const t = (await read()).oauthTokens.find((x) => x.tokenHash === tokenHash && x.kind === kind);
  return t && t.expiresAt > new Date().toISOString() ? t : null;
}
export function deleteOAuthToken(tokenHash: string) {
  return mutate((db) => {
    db.oauthTokens = db.oauthTokens.filter((t) => t.tokenHash !== tokenHash);
  });
}
/** Apps the user has connected (one entry per client with a live refresh token). */
export async function listConnectedClients(userId: string) {
  const db = await read();
  const now = new Date().toISOString();
  const ids = new Set(db.oauthTokens.filter((t) => t.userId === userId && t.kind === "refresh" && t.expiresAt > now).map((t) => t.clientId));
  return db.oauthClients.filter((c) => ids.has(c.clientId)).map((c) => ({ clientId: c.clientId, name: c.name, createdAt: c.createdAt }));
}
export function revokeUserTokens(userId: string, clientId?: string) {
  return mutate((db) => {
    db.oauthTokens = db.oauthTokens.filter((t) => !(t.userId === userId && (!clientId || t.clientId === clientId)));
  });
}
