"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne, tx } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { detectAndParse } from "@/parsers/registry";
import { saveUploadFile, deleteUploadFile } from "@/lib/upload-storage";

export async function uploadFileAction(formData: FormData) {
  const session = getSession();
  if (!session) redirect("/login");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect("/upload?err=Pilih%20file%20mutasi%20dulu");
  }

  if (file.size > 10 * 1024 * 1024) {
    redirect(`/upload?err=${encodeURIComponent("File terlalu besar (max 10MB)")}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = buffer.toString("utf8");

  // 1) Parse
  let parsed;
  try {
    parsed = detectAndParse(content, file.name);
  } catch (e: any) {
    redirect(`/upload?err=${encodeURIComponent(e.message ?? "Parser error")}`);
  }

  // 2) Match account by account_number
  const account = await queryOne<{
    id: number;
    branch_id: number;
    bank: string;
    account_number: string;
    account_holder: string;
    purpose: string;
    currency: string | null;
    branch_name: string;
  }>(
    `SELECT a.id, a.branch_id, a.bank, a.account_number, a.account_holder, a.purpose, a.currency,
            b.name AS branch_name
       FROM accounts a
       JOIN branches b ON b.id = a.branch_id
      WHERE a.account_number = $1`,
    [parsed.account_number]
  );

  if (!account) {
    redirect(
      `/upload?err=${encodeURIComponent(
        `Rekening ${parsed.account_number} tidak terdaftar. Tambahkan via Kelola Cabang dulu.`
      )}`
    );
  }

  // 3) RBAC: branch role hanya boleh upload akun cabangnya
  if (session.role === "branch" && account.branch_id !== session.branchId) {
    redirect(
      `/upload?err=${encodeURIComponent(
        `Rekening ${parsed.account_number} milik cabang lain (${account.branch_name}). Akses ditolak.`
      )}`
    );
  }

  // 4) Currency check — sekarang strict (account.currency selalu set, manual input)
  if (account.currency !== parsed.currency) {
    redirect(
      `/upload?err=${encodeURIComponent(
        `Currency mismatch: file ${parsed.currency}, akun ${account.currency}. Cek akun di Kelola Rekening atau pilih file yang benar.`
      )}`
    );
  }

  // 5) Insert uploads row (status=pending) — preview belum confirmed
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO uploads (
       account_id, branch_id, filename, mime_type, file_size_bytes,
       parser_name, date_from, date_to, currency,
       opening_balance, closing_balance,
       total_debit_period, total_credit_period,
       total_debit_count, total_credit_count,
       tx_count, status, uploaded_by_role, uploaded_by_branch_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending',$17,$18
     ) RETURNING id`,
    [
      account.id, account.branch_id, file.name, file.type || "text/csv", file.size,
      parsed.parser_name, parsed.date_from, parsed.date_to, parsed.currency,
      parsed.opening_balance, parsed.closing_balance,
      parsed.total_debit_period, parsed.total_credit_period,
      parsed.total_debit_count, parsed.total_credit_count,
      parsed.transactions.length,
      session.role,
      session.role === "branch" ? session.branchId : null,
    ]
  );
  const uploadId = rows[0].id;

  // 6) Save file ke disk
  let storagePath: string;
  try {
    storagePath = await saveUploadFile(uploadId, file.name, buffer);
    await db.query(`UPDATE uploads SET storage_path = $1 WHERE id = $2`, [storagePath, uploadId]);
  } catch (e: any) {
    await db.query(
      `UPDATE uploads SET status='failed', error_message=$1 WHERE id=$2`,
      [`File save failed: ${e.message}`, uploadId]
    );
    redirect(`/upload?err=${encodeURIComponent("Gagal simpan file: " + e.message)}`);
  }

  await logAudit(session, "upload_detected", {
    target_table: "uploads",
    target_id: uploadId,
    details: {
      filename: file.name,
      parser: parsed.parser_name,
      tx_count: parsed.transactions.length,
      account_id: account.id,
    },
  });

  redirect(`/upload/${uploadId}`);
}

/**
 * Hapus upload + cascade hapus semua transaksi terkait + hapus file raw.
 * Boleh untuk status: pending / success / failed (skip 'processing' karena race condition).
 * Recalculate current_balance akun setelah hapus.
 */
export async function deleteUploadAction(uploadId: number) {
  const session = getSession();
  if (!session) redirect("/login");

  const upload = await queryOne<{
    id: number;
    account_id: number;
    branch_id: number;
    filename: string;
    status: "pending" | "processing" | "success" | "failed";
    storage_path: string | null;
    tx_inserted: number;
  }>(
    `SELECT id, account_id, branch_id, filename, status, storage_path, tx_inserted
       FROM uploads WHERE id = $1`,
    [uploadId]
  );

  if (!upload) {
    redirect("/upload?err=Upload%20tidak%20ditemukan");
  }

  // RBAC
  if (session.role === "branch" && upload.branch_id !== session.branchId) {
    redirect("/upload?err=Akses%20ditolak");
  }

  // Jangan hapus saat sedang processing — race condition risk
  if (upload.status === "processing") {
    redirect(
      `/upload?err=${encodeURIComponent(
        "Upload sedang diproses. Tunggu sampai selesai sebelum dihapus."
      )}`
    );
  }

  // Count transaksi yang akan ter-delete (untuk audit log)
  const txRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM transactions WHERE upload_id = $1`,
    [uploadId]
  );
  const txCount = Number(txRow?.count ?? 0);

  // Delete dalam 1 transaction:
  // 1) Transactions (FK ON DELETE RESTRICT memaksa kita hapus dulu)
  // 2) Uploads row
  // 3) Recalculate accounts.current_balance dari sisa transaksi (kalau ada)
  try {
    await tx(async (client) => {
      await client.query(`DELETE FROM transactions WHERE upload_id = $1`, [uploadId]);
      await client.query(`DELETE FROM uploads WHERE id = $1`, [uploadId]);

      // Set current_balance ke balance transaksi terakhir yg masih ada untuk akun ini
      // (atau 0 kalau sudah tidak ada transaksi sama sekali)
      await client.query(
        `UPDATE accounts a
            SET current_balance = COALESCE((
                  SELECT t.balance FROM transactions t
                   WHERE t.account_id = a.id AND t.balance IS NOT NULL
                   ORDER BY t.tx_date DESC, t.id DESC
                   LIMIT 1
                ), 0),
                last_synced_at = (
                  SELECT MAX(processed_at) FROM uploads u
                   WHERE u.account_id = a.id AND u.status = 'success'
                )
          WHERE a.id = $1`,
        [upload.account_id]
      );
    });
  } catch (e: any) {
    redirect(`/upload?err=${encodeURIComponent("Gagal hapus: " + e.message)}`);
  }

  // Hapus file fisik (best-effort, tidak block kalau gagal)
  await deleteUploadFile(upload.storage_path);

  await logAudit(session, "delete_upload", {
    target_table: "uploads",
    target_id: uploadId,
    details: {
      filename: upload.filename,
      status_at_delete: upload.status,
      tx_deleted: txCount,
      account_id: upload.account_id,
    },
  });

  revalidatePath("/upload");
  revalidatePath("/transaksi");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");

  redirect(
    `/upload?msg=${encodeURIComponent(
      `Upload "${upload.filename}" dihapus${txCount > 0 ? ` beserta ${txCount} transaksi terkait` : ""}`
    )}`
  );
}
