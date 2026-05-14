// Registry semua adapter parser. Tambah adapter baru di array `adapters`.

import { bcaCsvAdapter } from "./bca-csv";
import type { ParseAdapter, ParseResult } from "./types";

const adapters: ParseAdapter[] = [bcaCsvAdapter];

export function detectAndParse(content: string, filename: string): ParseResult {
  for (const a of adapters) {
    if (a.detect(content, filename)) {
      return a.parse(content);
    }
  }
  throw new Error(
    "Format file tidak didukung. Saat ini baru BCA CSV yang aktif. Bank lain di milestone berikutnya."
  );
}

export function getAdapterNames(): string[] {
  return adapters.map((a) => a.name);
}
