// Save/read file mutasi raw ke local filesystem.
// UPLOAD_DIR di-set di .env.local (default: ./uploads).

import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";

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

/**
 * Ubah isi file mentah jadi teks yang bisa dimakan parser.
 *
 * CSV dikembalikan apa adanya. PDF diekstrak text layer-nya lalu diubah jadi
 * CSV, sehingga sisa pipeline (generic-engine, format_profiles, LLM bootstrap)
 * tidak perlu tahu bedanya.
 *
 * @param filename dipakai hanya untuk membaca ekstensi — boleh nama file asli
 *                 maupun storage_path, karena storage_path mempertahankan
 *                 ekstensi aslinya.
 */
export async function toParsableText(buffer: Buffer, filename: string): Promise<string> {
  if (extname(filename).toLowerCase() === ".pdf") {
    const { extractPdfAsCsv } = await import("./pdf-extract");
    return await extractPdfAsCsv(buffer);
  }
  return buffer.toString("utf8");
}

export async function readUploadFile(storagePath: string): Promise<string> {
  // Sengaja dibaca sebagai Buffer, bukan utf8 string — decode utf8 pada PDF
  // merusak isinya sebelum sempat diekstrak.
  const buffer = await readFile(storagePath);
  return await toParsableText(buffer, storagePath);
}

export async function deleteUploadFile(storagePath: string | null): Promise<void> {
  if (!storagePath) return;
  try {
    await unlink(storagePath);
  } catch {
    // ignore missing file
  }
}
