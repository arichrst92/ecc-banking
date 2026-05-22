"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { SegmentSchema } from "@/lib/validation";

export async function createSegmentAction(branchId: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = SegmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || null,
    status: formData.get("status"),
    notes: formData.get("notes") || null,
    display_order: formData.get("display_order") || 0,
  });
  if (!parsed.success) {
    redirect(`/cabang/${branchId}?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO segments (branch_id, name, code, status, notes, display_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [branchId, d.name, d.code?.toUpperCase() ?? null, d.status, d.notes, d.display_order]
    );
    await logAudit(session, "create_segment", {
      target_table: "segments", target_id: rows[0].id, details: { branch_id: branchId, ...d },
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/cabang/${branchId}?err=${encodeURIComponent("Nama Tipe Dana sudah dipakai di cabang ini")}`);
    }
    throw e;
  }

  revalidatePath(`/cabang/${branchId}`);
  redirect(`/cabang/${branchId}?msg=Tipe%20Dana%20ditambahkan`);
}

export async function updateSegmentAction(branchId: number, segmentId: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = SegmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || null,
    status: formData.get("status"),
    notes: formData.get("notes") || null,
    display_order: formData.get("display_order") || 0,
  });
  if (!parsed.success) {
    redirect(`/cabang/${branchId}?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  try {
    await db.query(
      `UPDATE segments
          SET name=$1, code=$2, status=$3, notes=$4, display_order=$5
        WHERE id=$6 AND branch_id=$7`,
      [d.name, d.code?.toUpperCase() ?? null, d.status, d.notes, d.display_order, segmentId, branchId]
    );
    await logAudit(session, "update_segment", {
      target_table: "segments", target_id: segmentId, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/cabang/${branchId}?err=${encodeURIComponent("Nama Tipe Dana sudah dipakai di cabang ini")}`);
    }
    throw e;
  }

  revalidatePath(`/cabang/${branchId}`);
  redirect(`/cabang/${branchId}?msg=Tipe%20Dana%20diperbarui`);
}

export async function deleteSegmentAction(branchId: number, segmentId: number) {
  const session = requireGlobal();

  const seg = await queryOne<{ name: string }>(
    `SELECT name FROM segments WHERE id=$1 AND branch_id=$2`, [segmentId, branchId]
  );
  if (!seg) redirect(`/cabang/${branchId}?err=Tipe%20Dana%20tidak%20ditemukan`);

  const subCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM sub_segments WHERE segment_id=$1`, [segmentId]
  );
  if (Number(subCount?.count ?? 0) > 0) {
    redirect(`/cabang/${branchId}?err=${encodeURIComponent(`Tidak bisa hapus — ${subCount?.count} Sub Tipe Dana masih ada di sini`)}`);
  }

  await db.query(`DELETE FROM segments WHERE id=$1 AND branch_id=$2`, [segmentId, branchId]);
  await logAudit(session, "delete_segment", {
    target_table: "segments", target_id: segmentId, details: { name: seg.name },
  });

  revalidatePath(`/cabang/${branchId}`);
  redirect(`/cabang/${branchId}?msg=Tipe%20Dana%20dihapus`);
}
