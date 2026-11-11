import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { promisify } from "util";
import { deleteSession, getBrand, getMedia, getReel, getSession, getUser, saveSession } from "./db";
import type { Brand, User } from "./types";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "tadaa_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await saveSession({ tokenHash: sha256(token), userId, expiresAt: expires.toISOString() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(sha256(token));
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getSession(sha256(token));
  return session ? getUser(session.userId) : null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please log in.");
  return user;
}

/** Load a brand and make sure the logged-in user owns it. */
export async function requireBrand(brandId: string): Promise<{ user: User; brand: Brand }> {
  const user = await requireUser();
  const brand = await getBrand(brandId);
  if (!brand || brand.ownerId !== user.id) throw new HttpError(404, "Brand not found");
  return { user, brand };
}

export async function requireReel(reelId: string) {
  const reel = await getReel(reelId);
  if (!reel) throw new HttpError(404, "Reel not found");
  const { user, brand } = await requireBrand(reel.brandId);
  return { user, brand, reel };
}

/**
 * The MP4 renderer runs in this container without a login cookie.
 * It gets a per-process secret appended to media URLs instead.
 */
const g = globalThis as unknown as { __tadaaRenderToken?: string };
export function renderToken() {
  if (!g.__tadaaRenderToken) g.__tadaaRenderToken = randomBytes(24).toString("base64url");
  return g.__tadaaRenderToken;
}

export async function canReadMedia(mediaId: string, rt: string | null) {
  const item = await getMedia(mediaId);
  if (!item) return null;
  if (rt && rt === renderToken()) return item;
  const user = await currentUser();
  if (!user) return null;
  const brand = await getBrand(item.brandId);
  return brand?.ownerId === user.id ? item : null;
}

/** Wrap a route handler so HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
