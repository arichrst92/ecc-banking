"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/**
 * Toggle view mode antara native ↔ usd.
 * Disimpan di cookie httpOnly false (supaya client bisa baca kalau perlu).
 */
export async function toggleViewModeAction() {
  const c = cookies();
  const current = c.get("ecc_view_mode")?.value;
  const next = current === "usd" ? "native" : "usd";

  c.set("ecc_view_mode", next, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86400, // 1 tahun
  });

  // Refresh semua page yang depend on view mode
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  revalidatePath("/transaksi");
  revalidatePath("/upload");
}
