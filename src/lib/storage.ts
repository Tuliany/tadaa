import { createReadStream, createWriteStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { S3Client } from "@aws-sdk/client-s3";
import { DATA_DIR } from "./store";

/**
 * File storage for uploads (photos, clips, logos) and renders (MP4s).
 * Uses an S3-compatible bucket (Railway Bucket) when AWS_S3_BUCKET_NAME is set, else the local data disk.
 * Files that exist only on the old data disk are still found until they've been copied to the bucket.
 */

export type FileKind = "uploads" | "renders";

const DISK = { uploads: path.join(DATA_DIR, "uploads"), renders: path.join(DATA_DIR, "renders") };
/** Local copies of bucket files (for ffprobe, publishing uploads, …). Disposable. */
const CACHE_DIR = path.join(os.tmpdir(), "tadaa-files");

const safe = (name: string) => path.basename(name);
const diskPath = (kind: FileKind, name: string) => path.join(DISK[kind], safe(name));
const objectKey = (kind: FileKind, name: string) => `${kind}/${safe(name)}`;

export function bucketEnabled() {
  return !!process.env.AWS_S3_BUCKET_NAME;
}

const g = globalThis as unknown as { __tadaaS3?: Promise<S3Client> };
async function s3() {
  return (g.__tadaaS3 ??= import("@aws-sdk/client-s3").then(
    ({ S3Client }) =>
      new S3Client({
        endpoint: process.env.AWS_ENDPOINT_URL || undefined,
        region: process.env.AWS_DEFAULT_REGION || "auto",
        forcePathStyle: process.env.AWS_S3_URL_STYLE === "path",
        credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "" },
      }),
  ));
}
const Bucket = () => process.env.AWS_S3_BUCKET_NAME!;

async function exists(file: string) {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

const notFound = (e: unknown) => {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404;
};

/** Store a file. `data` is the bytes or the path of a local file. */
export async function saveFile(kind: FileKind, name: string, data: Buffer | string) {
  if (!bucketEnabled()) {
    await fs.mkdir(DISK[kind], { recursive: true });
    if (typeof data === "string") {
      if (path.resolve(data) !== path.resolve(diskPath(kind, name))) await fs.copyFile(data, diskPath(kind, name));
    } else await fs.writeFile(diskPath(kind, name), data);
    return;
  }
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const size = typeof data === "string" ? (await fs.stat(data)).size : data.length;
  await (await s3()).send(
    new PutObjectCommand({
      Bucket: Bucket(),
      Key: objectKey(kind, name),
      Body: typeof data === "string" ? createReadStream(data) : data,
      ContentLength: size,
      ContentType: contentType(name),
    }),
  );
  // Keep a local copy: whatever was just stored is usually needed again right away.
  const cached = cachePath(kind, name);
  await fs.mkdir(path.dirname(cached), { recursive: true });
  if (typeof data === "string") {
    if (path.resolve(data) !== path.resolve(cached)) await fs.copyFile(data, cached).catch(() => {});
  }
  else await fs.writeFile(cached, data).catch(() => {});
}

/** Size of the object in the bucket, or null if it isn't there. */
export async function bucketSize(kind: FileKind, name: string): Promise<number | null> {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const r = await (await s3()).send(new HeadObjectCommand({ Bucket: Bucket(), Key: objectKey(kind, name) }));
    return r.ContentLength ?? 0;
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}

/** Size in bytes, or null if the file doesn't exist. */
export async function fileSize(kind: FileKind, name: string): Promise<number | null> {
  if (bucketEnabled()) {
    const size = await bucketSize(kind, name);
    if (size !== null) return size;
  }
  try {
    return (await fs.stat(diskPath(kind, name))).size;
  } catch {
    return null;
  }
}

/** Stream a file, optionally a byte range (inclusive). Null if missing. */
export async function openFile(kind: FileKind, name: string, range?: { start: number; end: number }): Promise<ReadableStream | null> {
  if (bucketEnabled()) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const r = await (await s3()).send(
        new GetObjectCommand({ Bucket: Bucket(), Key: objectKey(kind, name), Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
      );
      return r.Body!.transformToWebStream();
    } catch (e) {
      if (!notFound(e)) throw e;
    }
  }
  const file = diskPath(kind, name);
  if (!(await exists(file))) return null;
  return Readable.toWeb(createReadStream(file, range)) as ReadableStream;
}

function cachePath(kind: FileKind, name: string) {
  return path.join(CACHE_DIR, kind, safe(name));
}

/** A path on this machine with the file's contents (downloads from the bucket if needed). */
export async function localFile(kind: FileKind, name: string): Promise<string> {
  const onDisk = diskPath(kind, name);
  if (await exists(onDisk)) return onDisk;
  if (!bucketEnabled()) throw new Error("File not found.");
  const cached = cachePath(kind, name);
  if (await exists(cached)) return cached;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const r = await (await s3()).send(new GetObjectCommand({ Bucket: Bucket(), Key: objectKey(kind, name) }));
  await fs.mkdir(path.dirname(cached), { recursive: true });
  const tmp = `${cached}.${process.pid}.${Date.now()}.part`;
  await pipeline(r.Body as Readable, createWriteStream(tmp));
  await fs.rename(tmp, cached);
  pruneCache();
  return cached;
}

/** Where a new render should be written before it's stored. */
export async function renderScratchPath(name: string) {
  const dir = bucketEnabled() ? path.join(CACHE_DIR, "renders") : DISK.renders;
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, safe(name));
}

export async function deleteFile(kind: FileKind, name: string) {
  if (bucketEnabled()) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new DeleteObjectCommand({ Bucket: Bucket(), Key: objectKey(kind, name) })).catch(() => {});
    await fs.unlink(cachePath(kind, name)).catch(() => {});
  }
  await fs.unlink(diskPath(kind, name)).catch(() => {});
}

/** Files on the old data disk (for the one-time copy to the bucket). */
export async function diskFiles(kind: FileKind) {
  try {
    return (await fs.readdir(DISK[kind], { withFileTypes: true })).filter((d) => d.isFile() && !d.name.endsWith(".tmp")).map((d) => d.name);
  } catch {
    return [];
  }
}
export { diskPath };

/** Remove local copies untouched for a day (best effort, at most once an hour). */
let lastPrune = 0;
function pruneCache() {
  if (Date.now() - lastPrune < 3600_000) return;
  lastPrune = Date.now();
  (async () => {
    for (const kind of ["uploads", "renders"] as const) {
      const dir = path.join(CACHE_DIR, kind);
      for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
        const p = path.join(dir, f);
        const st = await fs.stat(p).catch(() => null);
        if (st && Date.now() - st.atimeMs > 86400_000 && Date.now() - st.mtimeMs > 86400_000) await fs.unlink(p).catch(() => {});
      }
    }
  })().catch(() => {});
}

function contentType(name: string) {
  const ext = path.extname(name).toLowerCase();
  return (
    { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" }[ext] ??
    "application/octet-stream"
  );
}
