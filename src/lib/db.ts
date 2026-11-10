import { promises as fs } from "fs";
import path from "path";
import type { Brand, MediaItem, Plan, Reel } from "./types";

/**
 * Local JSON-file store for development and demos.
 * Swap this module for a Supabase implementation in production;
 * the rest of the app only uses the functions exported here.
 */

export const DATA_DIR = process.env.TADAA_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface DB {
  brands: Brand[];
  media: MediaItem[];
  reels: Reel[];
  plans: Plan[];
}

const empty: DB = { brands: [], media: [], reels: [], plans: [] };

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

// Brands
export async function listBrands() {
  return (await read()).brands.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
