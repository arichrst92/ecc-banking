"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { SubSegmentSchema } from "@/lib/validation";

const back = (b: number, s: number, qs = "") =>
  `/cabang/${b}/tipe-dana/${s}${qs}`;

export async function createSubSegmentAction(branchId: number, segmentId: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = SubSegmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || null,
    status: formData.get("status"),
    notes: formData.get("notes") || null,
    display_order: formData.get("display_order") || 0,
  });
  if (!parsed.success) {
    redirect(back(branchId, segmentId, `?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`));
  }

  const d = parsed.data;
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO sub_segments (segment_id, name, code, status, notes, display_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [segmentId, d.name, d.code?.toUpperCase() ?? null, d.status, d.notes, d.display_order]
    );
    await logAudit(session, "create_sub_segment", {
      target_table: "sub_segments", target_id: rows[0].id, details: { segment_id: segmentId, ...d },
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(back(branchId, segmentId, `?err=${encodeURIComponent("Nama Sub Tipe Dana sudah dipakai")}`));
    }
    throw e;
  }

  revalidatePath(back(branchId, segmentId));
  redirect(back(branchId, segmentId, `?msg=Sub%20Tipe%20Dana%20ditambahkan`));
}

export async function updateSubSegmentAction(branchId: number, segmentId: number, subId: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = SubSegmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || null,
    status: formData.get("status"),
    notes: formData.get("notes") || null,
    display_order: formData.get("display_order") || 0,
  });
  if (!parsed.success) {
    redirect(back(branchId, segmentId, `?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`));
  }

  const d = parsed.data;
  try {
    await db.query(
      `UPDATE sub_segments
          SET name=$1, code=$2, status=$3, notes=$4, display_order=$5
        WHERE id=$6 AND segment_id=$7`,
      [d.name, d.code?.toUpperCase() ?? null, d.status, d.notes, d.display_order, subId, segmentId]
    );
    await logAudit(session, "update_sub_segment", {
      target_table: "sub_segments", target_id: subId, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(back(branchId, segmentId, `?err=${encodeURIComponent("Nama Sub Tipe Dana sudah dipakai")}`));
    }
    throw e;
  }

  revalidatePath(back(branchId, segmentId));
  redirect(back(branchId, segmentId, `?msg=Sub%20Tipe%20Dana%20diperbarui`));
}

export async function deleteSubSegmentAction(branchId: number, segmentId: number, subId: number) {
  const session = requireGlobal();

  const sub = await queryOne<{ name: string }>(
    `SELECT name FROM sub_segments WHERE id=$1 AND segment_id=$2`, [subId, segmentId]
  );
  if (!sub) redirect(back(branchId, segmentId, "?err=Sub%20Tipe%20Dana%20tidak%20ditemukan"));

  const acc = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM accounts WHERE sub_segment_id=$1`, [subId]
  );
  if (Number(acc?.count ?? 0) > 0) {
    redirect(back(branchId, segmentId, `?err=${encodeURIComponent(`Tidak bisa hapus — ${acc?.count} rekening masih ada di sini`)}`));
  }

  await db.query(`DELETE FROM sub_segments WHERE id=$1 AND segment_id=$2`, [subId, segmentId]);
  await logAudit(session, "delete_sub_segment", {
    target_table: "sub_segments", target_id: subId, details: { name: sub.name },
  });

  revalidatePath(back(branchId, segmentId));
  redirect(back(branchId, segmentId, "?msg=Sub%20Tipe%20Dana%20dihapus"));
}
