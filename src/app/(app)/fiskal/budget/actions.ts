"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function saveBudgetAction(formData: FormData) {
  const session = requireSession();

  const year = Number(formData.get("fiscal_year"));
  const currency = String(formData.get("currency") ?? "IDR").toUpperCase();
  let branchId = Number(formData.get("branch_id"));

  // RBAC: branch role hanya boleh cabangnya sendiri
  if (session.role === "branch") branchId = session.branchId!;

  if (!year || !branchId) {
    redirect(`/fiskal/budget?err=${encodeURIComponent("Cabang & tahun wajib dipilih")}`);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    redirect(`/fiskal/budget?err=${encodeURIComponent("Mata uang tidak valid")}`);
  }

  // Kumpulkan semua field amt_<catId>_<month>
  const rows: { catId: number; month: number; amount: number }[] = [];
  for (const [key, raw] of formData.entries()) {
    const m = /^amt_(\d+)_(\d+)$/.exec(key);
    if (!m) continue;
    const catId = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) continue;
    const amount = Math.max(0, Number(String(raw).replace(/[^0-9.-]/g, "")) || 0);
    rows.push({ catId, month, amount });
  }

  await tx(async (c) => {
    for (const r of rows) {
      if (r.amount > 0) {
        await c.query(
          `INSERT INTO fiscal_budgets (branch_id, category_id, fiscal_year, month, currency, amount)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (branch_id, category_id, fiscal_year, month)
           DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency`,
          [branchId, r.catId, year, r.month, currency, r.amount]
        );
      } else {
        // 0 → hapus entri (biar tabel bersih)
        await c.query(
          `DELETE FROM fiscal_budgets
            WHERE branch_id = $1 AND category_id = $2 AND fiscal_year = $3 AND month = $4`,
          [branchId, r.catId, year, r.month]
        );
      }
    }
  });

  await logAudit(session, "save_fiscal_budget", {
    target_table: "fiscal_budgets",
    details: { branch_id: branchId, fiscal_year: year, currency, rows: rows.length },
  });

  revalidatePath("/fiskal/budget");
  revalidatePath("/fiskal");
  redirect(`/fiskal/budget?year=${year}&branch=${branchId}&currency=${currency}&msg=${encodeURIComponent("Anggaran tersimpan")}`);
}
