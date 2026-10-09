"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { CategoryGroupSchema } from "@/lib/validation";

export async function createGroupAction(formData: FormData) {
  const session = requireGlobal();

  const parsed = CategoryGroupSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    display_order: formData.get("display_order"),
  });
  if (!parsed.success) {
    redirect(`/kategori/grup?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }
  const d = parsed.data;

  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO category_groups (name, kind, display_order) VALUES ($1, $2, $3) RETURNING id`,
      [d.name, d.kind, d.display_order]
    );
    await logAudit(session, "create_category_group", {
      target_table: "category_groups", target_id: rows[0].id, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") redirect(`/kategori/grup?err=${encodeURIComponent("Nama grup sudah dipakai")}`);
    throw e;
  }

  revalidatePath("/kategori/grup");
  revalidatePath("/kategori");
  redirect("/kategori/grup?msg=Grup%20ditambahkan");
}

export async function updateGroupAction(id: number, formData: FormData) {
  const session = requireGlobal();

  const parsed = CategoryGroupSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    display_order: formData.get("display_order"),
  });
  if (!parsed.success) {
    redirect(`/kategori/grup?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }
  const d = parsed.data;

  try {
    await db.query(
      `UPDATE category_groups SET name=$1, kind=$2, display_order=$3 WHERE id=$4`,
      [d.name, d.kind, d.display_order, id]
    );
    await logAudit(session, "update_category_group", {
      target_table: "category_groups", target_id: id, details: d,
    });
  } catch (e: any) {
    if (e.code === "23505") redirect(`/kategori/grup?err=${encodeURIComponent("Nama grup sudah dipakai")}`);
    throw e;
  }

  revalidatePath("/kategori/grup");
  revalidatePath("/kategori");
  redirect("/kategori/grup?msg=Grup%20diperbarui");
}

export async function deleteGroupAction(id: number) {
  const session = requireGlobal();
  // ON DELETE SET NULL → kategori yang pakai grup ini jadi tanpa grup (tidak terhapus).
  await db.query(`DELETE FROM category_groups WHERE id = $1`, [id]);
  await logAudit(session, "delete_category_group", {
    target_table: "category_groups", target_id: id, details: {},
  });
  revalidatePath("/kategori/grup");
  revalidatePath("/kategori");
  redirect("/kategori/grup?msg=Grup%20dihapus");
}
