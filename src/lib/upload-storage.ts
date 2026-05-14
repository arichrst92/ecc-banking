// Save/read file mutasi raw ke local filesystem.
// UPLOAD_DIR di-set di .env.local (default: ./uploads).

import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function getUploadDir(): string {
  const d = process.env.UPLOAD_DIR ?? "./uploads";
  return resolve(d); // absolute path
}

export async function saveUploadFile(
  uploadId: number,
  originalFilename: string,
  content: Buffer
): Promise<string> {
  const dir = getUploadDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const safe = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const finalName = `${uploadId}-${safe}`;
  const path = join(dir, finalName);
  await writeFile(path, content);
  return path;
}

export async function readUploadFile(storagePath: string): Promise<string> {
  return await readFile(storagePath, "utf8");
}

export async function deleteUploadFile(storagePath: string | null): Promise<void> {
  if (!storagePath) return;
  try {
    await unlink(storagePath);
  } catch {
    // ignore missing file
  }
}
