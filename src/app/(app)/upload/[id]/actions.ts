"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne, query, tx } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { detectAndParse } from "@/parsers/registry";
import { readUploadFile, deleteUploadFile } from "@/lib/upload-storage";
import { categorize } from "@/parsers/categorizer";
import { computeDupHash } from "@/lib/dup-hash";
import type { Category } from "@/lib/types";

export async function confirmUploadAction(uploadId: number) {
  const session = getSession();
  if (!session) redirect("/login");

  const upload = await queryOne<{
    id: number;
    account_id: number;
    branch_id: number;
    status: string;
    storage_path: string | null;
    parser_name: string;
    currency: string;
    opening_balance: string | null;
    closing_balance: string | null;
    date_from: string;
    date_to: string;
  }>(`SELECT * FROM uploads WHERE id = $1`, [uploadId]);

  if (!upload) redirect("/upload?err=Upload%20tidak%20ditemukan");
  if (upload.status !== "pending") {
    redirect(`/upload?err=${encodeURIComponent(`Upload sudah pernah diproses (status: ${upload.status})`)}`);
  }
  if (!upload.storage_path) {
    redirect(`/upload?err=${encodeURIComponent("File mutasi hilang dari penyimpanan")}`);
  }

  // RBAC
  if (session.role === "branch" && upload.branch_id !== session.branchId) {
    redirect("/upload?err=Akses%20ditolak");
  }

  // Mark processing
  await db.query(`UPDATE uploads SET status='processing' WHERE id = $1`, [uploadId]);

  let content: string;
  try {
    content = await readUploadFile(upload.storage_path);
  } catch (e: any) {
    await db.query(
      `UPDATE uploads SET status='failed', error_message=$1 WHERE id=$2`,
      [`Read file failed: ${e.message}`, uploadId]
    );
    redirect(`/upload?err=${encodeURIComponent("Gagal baca file: " + e.message)}`);
  }

  // Re-parse
  let parsed;
  try {
    parsed = detectAndParse(content, "");
  } catch (e: any) {
    await db.query(
      `UPDATE uploads SET status='failed', error_message=$1 WHERE id=$2`,
      [`Reparse failed: ${e.message}`, uploadId]
    );
    redirect(`/upload?err=${encodeURIComponent("Re-parse error: " + e.message)}`);
  }

  // Load categories for auto-cat
  const categories = await query<Category>(
    `SELECT * FROM categories ORDER BY priority ASC, name ASC`
  );

  // Insert dalam 1 transaction (DB-level)
  let inserted = 0;
  let duplicates = 0;
  let actualDebitSum = 0;
  let actualCreditSum = 0;
  let lastBalance: number | null = null;

  try {
    await tx(async (client) => {
      for (const t of parsed.transactions) {
        const catId = categorize(t.description_normalized, t.direction, categories);
        const dupHash = computeDupHash(
          upload.account_id,
          t.tx_date,
          t.debit,
          t.credit,
          t.description_normalized
        );

        const r = await client.query(
          `INSERT INTO transactions (
             account_id, branch_id, upload_id, category_id, currency,
             tx_date, tx_time, description, description_normalized, bank_branch_code,
             debit, credit, balance, direction, dup_hash
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
           )
           ON CONFLICT (dup_hash) DO NOTHING
           RETURNING id`,
          [
            upload.account_id, upload.branch_id, upload.id, catId, parsed.currency,
            t.tx_date, t.tx_time, t.description, t.description_normalized, t.bank_branch_code,
            t.debit, t.credit, t.balance, t.direction, dupHash,
          ]
        );

        if (r.rowCount && r.rowCount > 0) inserted++;
        else duplicates++;

        actualDebitSum += t.debit;
        actualCreditSum += t.credit;
        if (t.balance !== null) lastBalance = t.balance;
      }

      // Balance check
      const open = parseFloat(upload.opening_balance ?? "0");
      const close = parseFloat(upload.closing_balance ?? "0");
      const computed = open + actualCreditSum - actualDebitSum;
      const balanceOk = upload.closing_balance !== null
        ? Math.abs(close - computed) <= 1
        : null;

      // Update accounts: set currency (jika NULL), current_balance, last_synced_at
      await client.query(
        `UPDATE accounts
            SET currency = COALESCE(currency, $1),
                current_balance = COALESCE($2, current_balance),
                last_synced_at = NOW()
          WHERE id = $3`,
        [parsed.currency, lastBalance, upload.account_id]
      );

      // Update uploads: status=success
      await client.query(
        `UPDATE uploads
            SET status='success',
                tx_inserted = $1,
                tx_duplicates = $2,
                balance_check_passed = $3,
                processed_at = NOW(),
                error_message = NULL
          WHERE id = $4`,
        [inserted, duplicates, balanceOk, upload.id]
      );
    });
  } catch (e: any) {
    await db.query(
      `UPDATE uploads SET status='failed', error_message=$1 WHERE id=$2`,
      [`Insert failed: ${e.message}`, uploadId]
    );
    redirect(`/upload?err=${encodeURIComponent("Gagal simpan: " + e.message)}`);
  }

  await logAudit(session, "upload_confirmed", {
    target_table: "uploads",
    target_id: uploadId,
    details: { inserted, duplicates, tx_count_file: parsed.transactions.length },
  });

  revalidatePath("/upload");
  revalidatePath("/transaksi");
  revalidatePath("/dashboard");
  redirect(
    `/upload?msg=${encodeURIComponent(
      `${inserted} transaksi disimpan${duplicates > 0 ? `, ${duplicates} duplikat di-skip` : ""}`
    )}`
  );
}

export async function cancelUploadAction(uploadId: number) {
  const session = getSession();
  if (!session) redirect("/login");

  const upload = await queryOne<{
    branch_id: number;
    status: string;
    storage_path: string | null;
    filename: string;
  }>(`SELECT branch_id, status, storage_path, filename FROM uploads WHERE id = $1`, [uploadId]);

  if (!upload) redirect("/upload");

  if (session.role === "branch" && upload.branch_id !== session.branchId) {
    redirect("/upload?err=Akses%20ditolak");
  }

  if (upload.status !== "pending") {
    redirect(`/upload?err=${encodeURIComponent("Upload sudah diproses, tidak bisa dibatalkan")}`);
  }

  // Delete file + row
  await deleteUploadFile(upload.storage_path);
  await db.query(`DELETE FROM uploads WHERE id = $1`, [uploadId]);

  await logAudit(session, "upload_cancelled", {
    target_table: "uploads",
    target_id: uploadId,
    details: { filename: upload.filename },
  });

  revalidatePath("/upload");
  redirect("/upload?msg=Upload%20dibatalkan");
}
