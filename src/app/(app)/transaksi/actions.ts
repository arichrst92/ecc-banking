"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function recategorizeAction(txId: number, formData: FormData) {
  const session = getSession();
  if (!session) redirect("/login");

  const newCatId = Number(formData.get("category_id"));
  if (!newCatId || isNaN(newCatId)) {
    redirect(`/transaksi?err=${encodeURIComponent("Kategori tidak valid")}`);
  }

  // Fetch tx untuk RBAC
  const tx = await queryOne<{ branch_id: number; category_id: number; description: string }>(
    `SELECT branch_id, category_id, description FROM transactions WHERE id = $1`,
    [txId]
  );
  if (!tx) redirect("/transaksi?err=Transaksi%20tidak%20ditemukan");

  if (session.role === "branch" && tx.branch_id !== session.branchId) {
    redirect("/transaksi?err=Akses%20ditolak");
  }

  // Pastikan kategori valid
  const cat = await queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM categories WHERE id = $1`, [newCatId]
  );
  if (!cat) redirect("/transaksi?err=Kategori%20tidak%20ditemukan");

  if (tx.category_id === newCatId) {
    // No-op
    revalidatePath("/transaksi");
    redirect("/transaksi");
  }

  await db.query(
    `UPDATE transactions SET category_id = $1 WHERE id = $2`,
    [newCatId, txId]
  );

  await logAudit(session, "recategorize_tx", {
    target_table: "transactions",
    target_id: txId,
    details: {
      from_category_id: tx.category_id,
      to_category_id: newCatId,
      to_category_name: cat.name,
      description: tx.description.slice(0, 80),
    },
  });

  revalidatePath("/transaksi");
  revalidatePath("/laporan");
  revalidatePath("/dashboard");
}

export async function updateNoteAction(txId: number, formData: FormData) {
  const session = getSession();
  if (!session) redirect("/login");

  const note = String(formData.get("note") ?? "").trim() || null;

  const tx = await queryOne<{ branch_id: number }>(
    `SELECT branch_id FROM transactions WHERE id = $1`, [txId]
  );
  if (!tx) redirect("/transaksi?err=Transaksi%20tidak%20ditemukan");

  if (session.role === "branch" && tx.branch_id !== session.branchId) {
    redirect("/transaksi?err=Akses%20ditolak");
  }

  await db.query(`UPDATE transactions SET note = $1 WHERE id = $2`, [note, txId]);

  await logAudit(session, "update_tx_note", {
    target_table: "transactions", target_id: txId,
  });

  revalidatePath("/transaksi");
}
