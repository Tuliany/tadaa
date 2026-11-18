import { nanoid } from "nanoid";
import { soundUrl } from "./props";
import { store as db } from "./store";
import { fileSize, saveFile } from "./storage";
import type { SoundRef, StoredSound } from "./types";

/**
 * Sound effects and music from Openverse (api.openverse.org), which indexes Freesound, Jamendo and
 * Wikimedia Commons. We only use CC0 sounds: free for commercial use, no credit required.
 * A chosen sound is copied into our own storage so renders never depend on another site.
 */

const API = "https://api.openverse.org/v1";

export interface SoundHit extends SoundRef {
  /** Playable preview (the remote MP3). */
  preview: string;
}

/** Built-in pack: hand-picked short CC0 effects, so the common ones are one click away. */
export const SOUND_PACK: { key: string; label: string; emoji: string; id: string }[] = [
  { key: "whoosh", label: "Whoosh", emoji: "💨", id: "b7ae7822-8ec5-4a82-b6f8-d539b51caa61" },
  { key: "swoosh", label: "Swoosh", emoji: "🌀", id: "f1dc6045-7965-41de-87f8-4731d2583fd2" },
  { key: "pop", label: "Pop", emoji: "🫧", id: "54410e5a-ef30-4884-b74a-a500bbc22c77" },
  { key: "ding", label: "Ding", emoji: "🔔", id: "c78d2cd0-20ba-4b48-a7eb-f1fa716aca1d" },
  { key: "notification", label: "Notification", emoji: "📱", id: "63ef9260-41de-44ee-822a-fe6e91af2fd5" },
  { key: "camera", label: "Camera", emoji: "📸", id: "3290f0e3-a217-48c9-bafb-06401b961c21" },
  { key: "cash", label: "Cash register", emoji: "💰", id: "deafdf72-1f73-4d0a-a849-356212e09e83" },
  { key: "scratch", label: "Record scratch", emoji: "💿", id: "4a313d5d-4a68-43a8-99fa-e185e9909460" },
  { key: "drumroll", label: "Drum roll", emoji: "🥁", id: "bed39d40-bbda-45c0-a1e8-a1d56275d29a" },
  { key: "boing", label: "Boing", emoji: "🤸", id: "20fbb984-0fe8-41d6-8c9d-c47aa6832ab6" },
  { key: "applause", label: "Applause", emoji: "👏", id: "4330e190-f873-475c-b781-eee7e4494169" },
  { key: "cheer", label: "Cheer", emoji: "🎉", id: "c5ff6b85-ca4e-4d43-a2db-9d5e9f9238ae" },
  { key: "laugh", label: "Laughter", emoji: "😂", id: "d97d553e-e4cb-48ad-a48d-26743b66b6c3" },
  { key: "fail", label: "Sad trombone", emoji: "🎺", id: "8541b72b-f50e-496f-a2bb-5422fdb43258" },
  { key: "tada", label: "Tada!", emoji: "✨", id: "f3bb59f0-e401-46c8-a338-331a54f20576" },
  { key: "sparkle", label: "Sparkle", emoji: "🪄", id: "4beec0d4-ef0f-4969-beef-f329da2b5538" },
  { key: "typing", label: "Typewriter", emoji: "⌨️", id: "45e39673-e775-48d1-82e5-f5f0c5fdcf06" },
];

export const MUSIC_MOODS = ["upbeat", "happy", "calm", "acoustic", "piano", "electronic", "lofi", "cinematic", "jazz", "corporate"];

interface OvAudio {
  id: string;
  title?: string;
  creator?: string;
  license: string;
  url: string;
  filetype?: string;
  duration?: number | null;
  foreign_landing_url?: string;
  mature?: boolean;
}

// ---- Auth: anonymous works; OPENVERSE_CLIENT_ID/SECRET raise the rate limits. ----
let token: { value: string; until: number } | null = null;
async function authHeaders(): Promise<Record<string, string>> {
  const id = process.env.OPENVERSE_CLIENT_ID;
  const secret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret) return {};
  if (!token || token.until < Date.now()) {
    const res = await fetch(`${API}/auth_tokens/token/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    });
    if (!res.ok) return {};
    const j = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
  }
  return { authorization: `Bearer ${token.value}` };
}

async function ov<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { ...(await authHeaders()), "user-agent": "Tadaa (tadaaai.com)" } });
  if (res.status === 429) throw new Error("Too many sound searches right now. Try again in a minute.");
  if (!res.ok) throw new Error(`Sound search failed (${res.status}).`);
  return (await res.json()) as T;
}

const toRef = (a: OvAudio): SoundRef => ({
  id: a.id,
  title: (a.title || "Untitled").replace(/\.(wav|mp3|flac|aiff?|ogg)$/i, "").slice(0, 80),
  creator: a.creator || undefined,
  license: a.license,
  duration: Math.round(((a.duration ?? 0) / 1000) * 10) / 10,
  pageUrl: a.foreign_landing_url,
});

const usable = (a: OvAudio) => a.license === "cc0" && !a.mature && a.filetype === "mp3" && !!a.url && !!a.duration;

const cache = new Map<string, { at: number; hits: SoundHit[] }>();

/** Search CC0 sounds: short effects, or music (loops and tracks of at least 8 seconds). */
export async function searchSounds(q: string, kind: "effect" | "music"): Promise<SoundHit[]> {
  const query = q.trim().slice(0, 80) || (kind === "music" ? "upbeat" : "whoosh");
  const key = `${kind}:${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.hits;
  const params = new URLSearchParams({ q: kind === "music" ? `${query} music` : query, license: "cc0", page_size: "30", mature: "false" });
  if (kind === "effect") params.set("length", "shortest");
  const res = await ov<{ results: OvAudio[] }>(`/audio/?${params}`);
  let list = res.results.filter(usable);
  if (kind === "music") list = list.filter((a) => (a.duration ?? 0) >= 8000);
  else list = list.filter((a) => (a.duration ?? 0) <= 8000);
  const hits = list.slice(0, 20).map((a) => ({ ...toRef(a), preview: a.url }));
  cache.set(key, { at: Date.now(), hits });
  return hits;
}

/** One Openverse sound (only if it's usable CC0). */
async function lookup(id: string): Promise<{ ref: SoundRef; url: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const a = await ov<OvAudio>(`/audio/${id}/`).catch(() => null);
  return a && usable(a) ? { ref: toRef(a), url: a.url } : null;
}

export function getStoredSound(id: string) {
  return db().get<StoredSound>("sounds", { id });
}

/** Copies a CC0 sound into our storage (once) and returns it. */
export async function importSound(id: string): Promise<StoredSound> {
  const existing = await getStoredSound(id);
  if (existing && (await fileSize("uploads", existing.fileName)) !== null) return existing;
  const found = await lookup(id);
  if (!found) throw new Error("That sound isn't available. Pick another one.");
  const res = await fetch(found.url);
  if (!res.ok) throw new Error("Couldn't download that sound. Pick another one.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) throw new Error("That sound file is too big.");
  const fileName = `sound-${nanoid(8)}.mp3`;
  await saveFile("uploads", fileName, buf);
  const stored: StoredSound = { ...found.ref, fileName, mimeType: "audio/mpeg", importedAt: new Date().toISOString() };
  await db().put("sounds", id, stored);
  return stored;
}

/** The pack with previews (looked up once, then cached). */
let packCache: { at: number; items: (typeof SOUND_PACK[number] & { sound: SoundHit })[] } | null = null;
export async function soundPack() {
  if (packCache && Date.now() - packCache.at < 24 * 3600_000) return packCache.items;
  const items = (
    await Promise.all(
      SOUND_PACK.map(async (p) => {
        // Prefer our stored copy (no outside call); otherwise ask Openverse.
        const stored = await getStoredSound(p.id);
        if (stored) return { ...p, sound: { ...strip(stored), preview: soundUrl(p.id) } };
        const found = await lookup(p.id).catch(() => null);
        return found ? { ...p, sound: { ...found.ref, preview: found.url } } : null;
      }),
    )
  ).filter((x) => !!x);
  if (items.length) packCache = { at: Date.now(), items };
  return items;
}


export { soundUrl };

export function strip(s: StoredSound | SoundRef): SoundRef {
  return { id: s.id, title: s.title, creator: s.creator, license: s.license, duration: s.duration, pageUrl: s.pageUrl };
}
