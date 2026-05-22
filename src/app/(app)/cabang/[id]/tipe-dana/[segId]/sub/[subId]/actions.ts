"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { AccountSchema } from "@/lib/validation";

const back = (b: number, s: number, ss: number, qs = "") =>
  `/cabang/${b}/tipe-dana/${s}/sub/${ss}${qs}`;

export async function createAccountAction(
  branchId: number,
  segmentId: number,
  subId: number,
  formData: FormData
) {
  const session = requireGlobal();

  const parsed = AccountSchema.safeParse({
    sub_segment_id: subId,
    bank: formData.get("bank"),
    account_number: formData.get("account_number"),
    account_holder: formData.get("account_holder"),
    purpose: formData.get("purpose"),
    currency: formData.get("currency"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    redirect(back(branchId, segmentId, subId, `?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`));
  }

  const d = parsed.data;
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO accounts (
         branch_id, sub_segment_id, bank, account_number, account_holder,
         purpose, currency, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [branchId, subId, d.bank, d.account_number, d.account_holder, d.purpose, d.currency, d.status]
    );
    await logAudit(session, "create_account", {
      target_table: "accounts", target_id: rows[0].id, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(back(branchId, segmentId, subId, `?err=${encodeURIComponent("Rekening bank+nomor sudah terdaftar di sistem (mungkin di cabang/sub lain)")}`));
    }
    throw e;
  }

  revalidatePath(back(branchId, segmentId, subId));
  redirect(back(branchId, segmentId, subId, `?msg=Rekening%20ditambahkan`));
}

export async function updateAccountAction(
  branchId: number,
  segmentId: number,
  subId: number,
  accountId: number,
  formData: FormData
) {
  const session = requireGlobal();

  const parsed = AccountSchema.safeParse({
    sub_segment_id: subId,
    bank: formData.get("bank"),
    account_number: formData.get("account_number"),
    account_holder: formData.get("account_holder"),
    purpose: formData.get("purpose"),
    currency: formData.get("currency"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    redirect(back(branchId, segmentId, subId, `?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`));
  }

  const d = parsed.data;
  try {
    await db.query(
      `UPDATE accounts
          SET bank=$1, account_number=$2, account_holder=$3,
              purpose=$4, currency=$5, status=$6
        WHERE id=$7 AND sub_segment_id=$8`,
      [d.bank, d.account_number, d.account_holder, d.purpose, d.currency, d.status, accountId, subId]
    );
    await logAudit(session, "update_account", {
      target_table: "accounts", target_id: accountId, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(back(branchId, segmentId, subId, `?err=${encodeURIComponent("Bank+nomor rekening sudah dipakai akun lain")}`));
    }
    throw e;
  }

  revalidatePath(back(branchId, segmentId, subId));
  redirect(back(branchId, segmentId, subId, `?msg=Rekening%20diperbarui`));
}

export async function deleteAccountAction(
  branchId: number,
  segmentId: number,
  subId: number,
  accountId: number
) {
  const session = requireGlobal();

  const inUse = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM transactions WHERE account_id = $1`, [accountId]
  );
  if (Number(inUse?.count ?? 0) > 0) {
    redirect(back(branchId, segmentId, subId, `?err=${encodeURIComponent(`Tidak bisa hapus — ${inUse?.count} transaksi masih terdaftar`)}`));
  }

  const acc = await queryOne<{ bank: string; account_number: string }>(
    `SELECT bank, account_number FROM accounts WHERE id = $1`, [accountId]
  );

  await db.query(`DELETE FROM accounts WHERE id=$1 AND sub_segment_id=$2`, [accountId, subId]);
  await logAudit(session, "delete_account", {
    target_table: "accounts", target_id: accountId, details: acc ?? {},
  });

  revalidatePath(back(branchId, segmentId, subId));
  redirect(back(branchId, segmentId, subId, `?msg=Rekening%20dihapus`));
}
