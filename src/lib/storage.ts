import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "./db";

/** Local file storage. Replace with Supabase Storage (or S3) in production. */
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const RENDER_DIR = path.join(DATA_DIR, "renders");

export async function saveUpload(fileName: string, data: Buffer) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, fileName), data);
}

export function uploadPath(fileName: string) {
  return path.join(UPLOAD_DIR, path.basename(fileName));
}

export function renderPath(fileName: string) {
  return path.join(RENDER_DIR, path.basename(fileName));
}
