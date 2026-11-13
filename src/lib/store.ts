import { promises as fs } from "fs";
import path from "path";
import type { Pool, PoolClient } from "pg";

/**
 * A tiny document store: named collections of JSON documents, each with a key.
 * Postgres (one `docs` table with a JSONB column) when DATABASE_URL is set,
 * else a JSON file on disk for local development.
 */

export const COLLECTIONS = [
  "users",
  "sessions",
  "resets",
  "brands",
  "media",
  "reels",
  "plans",
  "oauthClients",
  "oauthCodes",
  "oauthTokens",
  "connections",
  "settings",
] as const;
export type Collection = (typeof COLLECTIONS)[number];

type Doc = Record<string, unknown>;
type Match = Record<string, string | number | boolean>;

export interface Tx {
  find<T>(c: Collection, match?: Match): Promise<T[]>;
  get<T>(c: Collection, match: Match): Promise<T | null>;
  put(c: Collection, key: string, doc: object): Promise<void>;
  del(c: Collection, match: Match): Promise<void>;
  /** Removes documents whose `expiresAt` is in the past. */
  delExpired(c: Collection): Promise<void>;
}
export interface Store extends Tx {
  /** Runs `fn` atomically; transactions run one at a time. */
  tx<T>(fn: (t: Tx) => Promise<T>): Promise<T>;
  kind: "postgres" | "json";
}

export const DATA_DIR = process.env.TADAA_DATA_DIR || path.join(process.cwd(), "data");
export const LEGACY_DB_FILE = path.join(DATA_DIR, "db.json");

const matches = (d: Doc, m?: Match) => !m || Object.entries(m).every(([k, v]) => d[k] === v);

// ---------- JSON file ----------

type JsonDB = Record<Collection, { key: string; doc: Doc }[]>;

function jsonStore(): Store {
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<JsonDB> {
    const db = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as JsonDB;
    try {
      const raw = JSON.parse(await fs.readFile(LEGACY_DB_FILE, "utf8")) as Record<string, unknown[]>;
      // The file holds a plain array per collection; keys are derived the same way as in Postgres.
      for (const c of COLLECTIONS) {
        db[c] = ((raw[c] ?? []) as Doc[]).map((doc) => ({ key: keyOf(c, doc), doc }));
      }
    } catch {
      /* new database */
    }
    return db;
  }
  async function save(db: JsonDB) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const plain = Object.fromEntries(COLLECTIONS.map((c) => [c, db[c].map((x) => x.doc)]));
    const tmp = LEGACY_DB_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(plain, null, 2));
    await fs.rename(tmp, LEGACY_DB_FILE);
  }
  const ops = (db: JsonDB): Tx => ({
    async find<T>(c: Collection, m?: Match) {
      return db[c].filter((x) => matches(x.doc, m)).map((x) => structuredClone(x.doc) as T);
    },
    async get<T>(c: Collection, m: Match) {
      const x = db[c].find((y) => matches(y.doc, m));
      return x ? (structuredClone(x.doc) as T) : null;
    },
    async put(c, key, doc) {
      const i = db[c].findIndex((x) => x.key === key);
      const row = { key, doc: structuredClone(doc) as Doc };
      if (i >= 0) db[c][i] = row;
      else db[c].push(row);
    },
    async del(c, m) {
      db[c] = db[c].filter((x) => !matches(x.doc, m));
    },
    async delExpired(c) {
      const now = new Date().toISOString();
      db[c] = db[c].filter((x) => !(typeof x.doc.expiresAt === "string" && x.doc.expiresAt <= now));
    },
  });
  function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    const next = queue.then(async () => {
      const db = await load();
      const out = await fn(ops(db));
      await save(db);
      return out;
    });
    queue = next.catch(() => undefined);
    return next;
  }
  return {
    kind: "json",
    tx,
    find: async (c, m) => ops(await load()).find(c, m),
    get: async (c, m) => ops(await load()).get(c, m),
    put: (c, k, d) => tx((t) => t.put(c, k, d)),
    del: (c, m) => tx((t) => t.del(c, m)),
    delExpired: (c) => tx((t) => t.delExpired(c)),
  };
}

// ---------- Postgres ----------

const SCHEMA = `
create table if not exists docs (
  collection text not null,
  key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, key)
);
create index if not exists docs_data_gin on docs using gin (data jsonb_path_ops);
`;

function pgStore(url: string): Store {
  let pool: Pool | null = null;
  let ready: Promise<Pool> | null = null;

  function connect() {
    return (ready ??= (async () => {
      const { Pool } = await import("pg");
      const local = /@(localhost|127\.0\.0\.1|[\w-]+\.railway\.internal)(:|\/)/.test(url);
      pool = new Pool({ connectionString: url, max: 5, ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false } });
      await pool.query(SCHEMA);
      return pool;
    })().catch((e) => {
      ready = null;
      throw e;
    }));
  }

  type Q = Pool | PoolClient;
  const ops = (q: () => Promise<Q>): Tx => ({
    async find<T>(c: Collection, m?: Match) {
      const r = await (await q()).query("select data from docs where collection = $1 and data @> $2::jsonb", [c, JSON.stringify(m ?? {})]);
      return r.rows.map((x) => x.data as T);
    },
    async get<T>(c: Collection, m: Match) {
      const r = await (await q()).query("select data from docs where collection = $1 and data @> $2::jsonb limit 1", [c, JSON.stringify(m)]);
      return (r.rows[0]?.data as T) ?? null;
    },
    async put(c, key, doc) {
      await (await q()).query(
        "insert into docs (collection, key, data) values ($1, $2, $3::jsonb) on conflict (collection, key) do update set data = excluded.data, updated_at = now()",
        [c, key, JSON.stringify(doc)],
      );
    },
    async del(c, m) {
      await (await q()).query("delete from docs where collection = $1 and data @> $2::jsonb", [c, JSON.stringify(m)]);
    },
    async delExpired(c) {
      await (await q()).query("delete from docs where collection = $1 and data->>'expiresAt' <= $2", [c, new Date().toISOString()]);
    },
  });

  return {
    kind: "postgres",
    ...ops(connect),
    async tx<T>(fn: (t: Tx) => Promise<T>) {
      const client = await (await connect()).connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(7426)");
        const out = await fn(ops(async () => client));
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

/** The key each collection's documents are stored under. */
export function keyOf(c: Collection, d: Doc): string {
  switch (c) {
    case "sessions":
    case "resets":
      return String(d.tokenHash);
    case "oauthTokens":
      return `${d.kind}:${d.tokenHash}`;
    case "oauthCodes":
      return String(d.codeHash);
    case "oauthClients":
      return String(d.clientId);
    case "plans":
      return String(d.brandId);
    case "connections":
      return `${d.brandId}:${d.provider}`;
    default:
      return String(d.id);
  }
}

const g = globalThis as unknown as { __tadaaStore?: Store };
export function store(): Store {
  return (g.__tadaaStore ??= process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : jsonStore());
}
