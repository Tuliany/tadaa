import { promises as fs } from "fs";
import { getSetting, setSetting } from "./db";
import { bucketEnabled, bucketSize, diskFiles, diskPath, saveFile, type FileKind } from "./storage";
import { COLLECTIONS, keyOf, LEGACY_DB_FILE, store } from "./store";

/**
 * One-time move from the old data disk:
 *  1. db.json → Postgres (before the server takes requests)
 *  2. uploads/ and renders/ → the bucket (in the background; files are served from the disk meanwhile)
 * Both steps are safe to run again – nothing is overwritten or deleted.
 */
export async function migrateFromDisk() {
  const db = store();
  if (db.kind === "postgres" && !(await getSetting<string>("migratedFromJson"))) {
    let raw: Record<string, Record<string, unknown>[]> | null = null;
    try {
      raw = JSON.parse(await fs.readFile(LEGACY_DB_FILE, "utf8"));
    } catch {
      /* no old database – a fresh install */
    }
    if (raw) {
      const counts: string[] = [];
      await db.tx(async (t) => {
        for (const c of COLLECTIONS) {
          const docs = raw![c] ?? [];
          for (const doc of docs) {
            // Never overwrite something already written to Postgres.
            if (!(await t.get(c, keyMatch(c, doc)))) await t.put(c, keyOf(c, doc), doc);
          }
          if (docs.length) counts.push(`${docs.length} ${c}`);
        }
      });
      console.log(`[migrate] copied db.json to Postgres: ${counts.join(", ") || "empty"}`);
    }
    await setSetting("migratedFromJson", new Date().toISOString());
  }

  if (bucketEnabled() && !(await getSetting<string>("filesMigrated"))) {
    copyFilesToBucket().catch((e) => console.error("[migrate] copying files to the bucket failed; will retry on next start:", e));
  }
}

function keyMatch(c: (typeof COLLECTIONS)[number], doc: Record<string, unknown>) {
  const pick = (...ks: string[]) => Object.fromEntries(ks.map((k) => [k, doc[k] as string]));
  switch (c) {
    case "sessions":
    case "resets":
      return pick("tokenHash");
    case "oauthTokens":
      return pick("tokenHash", "kind");
    case "oauthCodes":
      return pick("codeHash");
    case "oauthClients":
      return pick("clientId");
    case "plans":
      return pick("brandId");
    case "connections":
      return pick("brandId", "provider");
    default:
      return pick("id");
  }
}

async function copyFilesToBucket() {
  let copied = 0;
  let skipped = 0;
  for (const kind of ["uploads", "renders"] as FileKind[]) {
    for (const name of await diskFiles(kind)) {
      const local = diskPath(kind, name);
      const size = (await fs.stat(local)).size;
      if ((await bucketSize(kind, name)) === size) {
        skipped++;
        continue;
      }
      await saveFile(kind, name, local);
      copied++;
    }
  }
  await setSetting("filesMigrated", new Date().toISOString());
  console.log(`[migrate] files on the bucket: ${copied} copied, ${skipped} already there`);
}

