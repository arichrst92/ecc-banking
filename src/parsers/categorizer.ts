// Auto-kategorisasi: cocokkan keyword di description_normalized.
// Categories di-pass-in (caller sudah load via SELECT ... ORDER BY priority).

import type { Category } from "@/lib/types";

export function categorize(
  descriptionNormalized: string,
  direction: "in" | "out",
  categories: Category[]
): number {
  // Loop kategori non-system dulu, urut priority ascending
  for (const cat of categories) {
    if (cat.is_system) continue;
    if (cat.keywords.length === 0) continue;
    if (cat.type === "masuk" && direction !== "in") continue;
    if (cat.type === "keluar" && direction !== "out") continue;
    for (const kw of cat.keywords) {
      if (!kw) continue;
      if (descriptionNormalized.includes(kw.toUpperCase())) return cat.id;
    }
  }
  // Fallback ke kategori system ("Lain-lain")
  const fallback = categories.find((c) => c.is_system);
  if (!fallback) {
    throw new Error("Kategori system 'Lain-lain' tidak ditemukan. Jalankan seed migration.");
  }
  return fallback.id;
}
