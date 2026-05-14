"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { CategorySchema, parseKeywords } from "@/lib/validation";

export async function createCategoryAction(formData: FormData) {
  const session = requireGlobal();

  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    keywords_raw: formData.get("keywords_raw"),
    color: formData.get("color"),
    priority: formData.get("priority"),
  });

  if (!parsed.success) {
    redirect(`/kategori?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  const keywords = parseKeywords(d.keywords_raw);

  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO categories (name, type, keywords, color, priority, is_system)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING id`,
      [d.name, d.type, keywords, d.color, d.priority]
    );
    await logAudit(session, "create_category", {
      target_table: "categories", target_id: rows[0].id, details: { ...d, keywords },
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/kategori?err=${encodeURIComponent("Nama kategori sudah dipakai")}`);
    }
    throw e;
  }

  revalidatePath("/kategori");
  redirect("/kategori?msg=Kategori%20ditambahkan");
}

export async function updateCategoryAction(id: number, formData: FormData) {
  const session = requireGlobal();

  const existing = await queryOne<{ is_system: boolean }>(
    `SELECT is_system FROM categories WHERE id = $1`, [id]
  );
  if (!existing) redirect("/kategori?err=Kategori%20tidak%20ditemukan");
  if (existing.is_system) {
    redirect(`/kategori?err=${encodeURIComponent("Kategori system tidak bisa diubah")}`);
  }

  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    keywords_raw: formData.get("keywords_raw"),
    color: formData.get("color"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) {
    redirect(`/kategori?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;
  const keywords = parseKeywords(d.keywords_raw);

  try {
    await db.query(
      `UPDATE categories
          SET name=$1, type=$2, keywords=$3, color=$4, priority=$5
        WHERE id=$6 AND is_system=false`,
      [d.name, d.type, keywords, d.color, d.priority, id]
    );
    await logAudit(session, "update_category", {
      target_table: "categories", target_id: id, details: { ...d, keywords },
    });
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/kategori?err=${encodeURIComponent("Nama kategori sudah dipakai")}`);
    }
    throw e;
  }

  revalidatePath("/kategori");
  redirect("/kategori?msg=Kategori%20diperbarui");
}

export async function deleteCategoryAction(id: number) {
  const session = requireGlobal();

  const existing = await queryOne<{ is_system: boolean; name: string }>(
    `SELECT is_system, name FROM categories WHERE id = $1`, [id]
  );
  if (!existing) redirect("/kategori?err=Kategori%20tidak%20ditemukan");
  if (existing.is_system) {
    redirect(`/kategori?err=${encodeURIComponent("Kategori system tidak bisa dihapus")}`);
  }

  // Cek apakah ada transaksi yang refer
  const inUse = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM transactions WHERE category_id = $1`, [id]
  );
  if (Number(inUse?.count ?? 0) > 0) {
    redirect(`/kategori?err=${encodeURIComponent(`Tidak bisa hapus — ${inUse?.count} transaksi masih pakai kategori ini`)}`);
  }

  await db.query(`DELETE FROM categories WHERE id = $1 AND is_system = false`, [id]);
  await logAudit(session, "delete_category", {
    target_table: "categories", target_id: id, details: { name: existing.name },
  });

  revalidatePath("/kategori");
  redirect("/kategori?msg=Kategori%20dihapus");
}
