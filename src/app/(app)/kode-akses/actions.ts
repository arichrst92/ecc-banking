"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ResetCodeSchema } from "@/lib/validation";

export async function resetCodeAction(formData: FormData) {
  const session = requireGlobal();

  const parsed = ResetCodeSchema.safeParse({
    scope: formData.get("scope"),
    branch_id: formData.get("branch_id") || undefined,
    new_code: formData.get("new_code"),
  });
  if (!parsed.success) {
    redirect(`/kode-akses?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  if (d.scope === "branch" && !d.branch_id) {
    redirect(`/kode-akses?err=${encodeURIComponent("Branch ID wajib untuk scope branch")}`);
  }

  const hash = await bcrypt.hash(d.new_code, 12);

  if (d.scope === "global") {
    const result = await db.query(
      `UPDATE auth_codes
          SET code_hash = $1, updated_at = NOW()
        WHERE scope = 'global' AND branch_id IS NULL AND is_active = true`,
      [hash]
    );
    if (result.rowCount === 0) {
      // Buat baru kalau belum ada
      await db.query(
        `INSERT INTO auth_codes (scope, branch_id, code_hash, is_active)
         VALUES ('global', NULL, $1, true)`,
        [hash]
      );
    }
    await logAudit(session, "reset_code_global", {
      target_table: "auth_codes", details: { scope: "global" },
    });
  } else {
    const branch = await queryOne<{ name: string }>(
      `SELECT name FROM branches WHERE id = $1`, [d.branch_id!]
    );
    if (!branch) {
      redirect(`/kode-akses?err=${encodeURIComponent("Cabang tidak ditemukan")}`);
    }

    const result = await db.query(
      `UPDATE auth_codes
          SET code_hash = $1, updated_at = NOW()
        WHERE scope = 'branch' AND branch_id = $2 AND is_active = true`,
      [hash, d.branch_id!]
    );
    if (result.rowCount === 0) {
      await db.query(
        `INSERT INTO auth_codes (scope, branch_id, code_hash, is_active)
         VALUES ('branch', $1, $2, true)`,
        [d.branch_id!, hash]
      );
    }
    await logAudit(session, "reset_code_branch", {
      target_table: "auth_codes", target_id: d.branch_id!,
      details: { scope: "branch", branch_name: branch.name },
    });
  }

  revalidatePath("/kode-akses");
  redirect(
    `/kode-akses?msg=${encodeURIComponent(`Kode akses ${d.scope === "global" ? "Global" : "cabang"} berhasil di-reset`)}`
  );
}
