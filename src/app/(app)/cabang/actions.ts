"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { BranchSchema } from "@/lib/validation";

export async function createBranchAction(formData: FormData) {
  const session = requireGlobal();

  const parsed = BranchSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    pic_name: formData.get("pic_name"),
    pic_phone: formData.get("pic_phone") || null,
    status: formData.get("status"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) {
    redirect(`/cabang?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO branches (name, code, pic_name, pic_phone, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [d.name, d.code.toUpperCase(), d.pic_name, d.pic_phone, d.status, d.notes]
    );
    const newId = rows[0].id;

    // Auto-create placeholder auth code untuk cabang baru. Reset di /kode-akses.
    await db.query(
      `INSERT INTO auth_codes (scope, branch_id, code_hash, is_active)
       VALUES ('branch', $1, 'PLACEHOLDER_RESET_REQUIRED', true)
       ON CONFLICT DO NOTHING`,
      [newId]
    );

    // Auto-create default segment "Umum" + sub_segment "Umum" supaya cascade filter
    // langsung functional dan user bisa langsung tambah rekening.
    const segResult = await db.query<{ id: number }>(
      `INSERT INTO segments (branch_id, name, code, status, display_order)
       VALUES ($1, 'Umum', 'UMUM', 'aktif', 0)
       ON CONFLICT (branch_id, name) DO NOTHING
       RETURNING id`,
      [newId]
    );
    if (segResult.rows[0]) {
      await db.query(
        `INSERT INTO sub_segments (segment_id, name, code, status, display_order)
         VALUES ($1, 'Umum', 'UMUM', 'aktif', 0)
         ON CONFLICT (segment_id, name) DO NOTHING`,
        [segResult.rows[0].id]
      );
    }

    await logAudit(session, "create_branch", {
      target_table: "branches", target_id: newId, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/cabang?err=${encodeURIComponent("Kode cabang sudah dipakai")}`);
    }
    throw e;
  }

  revalidatePath("/cabang");
  redirect("/cabang?msg=Cabang%20ditambahkan%20%E2%80%94%20jangan%20lupa%20set%20kode%20akses");
}

export async function updateBranchAction(id: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = BranchSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    pic_name: formData.get("pic_name"),
    pic_phone: formData.get("pic_phone") || null,
    status: formData.get("status"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) {
    redirect(`/cabang?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  try {
    await db.query(
      `UPDATE branches
          SET name=$1, code=$2, pic_name=$3, pic_phone=$4, status=$5, notes=$6
        WHERE id=$7`,
      [d.name, d.code.toUpperCase(), d.pic_name, d.pic_phone, d.status, d.notes, id]
    );
    await logAudit(session, "update_branch", {
      target_table: "branches", target_id: id, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/cabang?err=${encodeURIComponent("Kode cabang sudah dipakai")}`);
    }
    throw e;
  }

  revalidatePath("/cabang");
  redirect("/cabang?msg=Cabang%20diperbarui");
}

export async function deleteBranchAction(id: number) {
  const session = requireGlobal();

  const branch = await queryOne<{ name: string }>(
    `SELECT name FROM branches WHERE id = $1`, [id]
  );
  if (!branch) redirect("/cabang?err=Cabang%20tidak%20ditemukan");

  const acc = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM accounts WHERE branch_id = $1`, [id]
  );
  if (Number(acc?.count ?? 0) > 0) {
    redirect(`/cabang?err=${encodeURIComponent(`Tidak bisa hapus — ${acc?.count} rekening masih terdaftar di cabang ini`)}`);
  }

  await db.query(`DELETE FROM branches WHERE id = $1`, [id]);
  await logAudit(session, "delete_branch", {
    target_table: "branches", target_id: id, details: { name: branch.name },
  });

  revalidatePath("/cabang");
  redirect("/cabang?msg=Cabang%20dihapus");
}
