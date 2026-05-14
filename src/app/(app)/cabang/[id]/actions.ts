"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { AccountSchema } from "@/lib/validation";

export async function createAccountAction(branchId: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = AccountSchema.safeParse({
    branch_id: branchId,
    bank: formData.get("bank"),
    account_number: formData.get("account_number"),
    account_holder: formData.get("account_holder"),
    purpose: formData.get("purpose"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    redirect(`/cabang/${branchId}?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO accounts (branch_id, bank, account_number, account_holder, purpose, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [branchId, d.bank, d.account_number, d.account_holder, d.purpose, d.status]
    );
    await logAudit(session, "create_account", {
      target_table: "accounts", target_id: rows[0].id, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/cabang/${branchId}?err=${encodeURIComponent("Rekening bank + nomor itu sudah terdaftar (mungkin di cabang lain)")}`);
    }
    throw e;
  }

  revalidatePath(`/cabang/${branchId}`);
  redirect(`/cabang/${branchId}?msg=Rekening%20ditambahkan`);
}

export async function updateAccountAction(branchId: number, accountId: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = AccountSchema.safeParse({
    branch_id: branchId,
    bank: formData.get("bank"),
    account_number: formData.get("account_number"),
    account_holder: formData.get("account_holder"),
    purpose: formData.get("purpose"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    redirect(`/cabang/${branchId}?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  try {
    await db.query(
      `UPDATE accounts
          SET bank=$1, account_number=$2, account_holder=$3, purpose=$4, status=$5
        WHERE id=$6 AND branch_id=$7`,
      [d.bank, d.account_number, d.account_holder, d.purpose, d.status, accountId, branchId]
    );
    await logAudit(session, "update_account", {
      target_table: "accounts", target_id: accountId, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/cabang/${branchId}?err=${encodeURIComponent("Bank + nomor rekening sudah dipakai akun lain")}`);
    }
    throw e;
  }

  revalidatePath(`/cabang/${branchId}`);
  redirect(`/cabang/${branchId}?msg=Rekening%20diperbarui`);
}

export async function deleteAccountAction(branchId: number, accountId: number) {
  const session = requireGlobal();

  const inUse = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM transactions WHERE account_id = $1`, [accountId]
  );
  if (Number(inUse?.count ?? 0) > 0) {
    redirect(`/cabang/${branchId}?err=${encodeURIComponent(`Tidak bisa hapus — ${inUse?.count} transaksi masih terdaftar`)}`);
  }

  const acc = await queryOne<{ bank: string; account_number: string }>(
    `SELECT bank, account_number FROM accounts WHERE id = $1`, [accountId]
  );

  await db.query(`DELETE FROM accounts WHERE id = $1 AND branch_id = $2`, [accountId, branchId]);
  await logAudit(session, "delete_account", {
    target_table: "accounts", target_id: accountId, details: acc ?? {},
  });

  revalidatePath(`/cabang/${branchId}`);
  redirect(`/cabang/${branchId}?msg=Rekening%20dihapus`);
}
