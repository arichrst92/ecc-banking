"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function toggleProfileStatusAction(profileId: number, newStatus: "active" | "disabled") {
  const session = requireGlobal();

  const p = await queryOne<{ name: string; status: string }>(
    `SELECT name, status FROM format_profiles WHERE id = $1`, [profileId]
  );
  if (!p) redirect("/format-profiles?err=Profile%20tidak%20ditemukan");

  await db.query(
    `UPDATE format_profiles SET status = $1 WHERE id = $2`,
    [newStatus, profileId]
  );

  await logAudit(session, "format_profile_status_change", {
    target_table: "format_profiles",
    target_id: profileId,
    details: { name: p.name, from: p.status, to: newStatus },
  });

  revalidatePath("/format-profiles");
  redirect(`/format-profiles?msg=${encodeURIComponent(`Status profile "${p.name}" → ${newStatus}`)}`);
}

export async function deleteProfileAction(profileId: number) {
  const session = requireGlobal();

  const p = await queryOne<{ name: string }>(
    `SELECT name FROM format_profiles WHERE id = $1`, [profileId]
  );
  if (!p) redirect("/format-profiles?err=Profile%20tidak%20ditemukan");

  // Check uploads yang reference profile ini
  const ref = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM uploads WHERE format_profile_id = $1`, [profileId]
  );
  // FK SET NULL — aman hapus, tapi upload history kehilangan referensi
  // Lebih aman: minta user disable saja
  if (Number(ref?.count ?? 0) > 0) {
    redirect(
      `/format-profiles?err=${encodeURIComponent(
        `Profile masih dipakai ${ref?.count} upload history. Disable saja (jangan hapus) supaya history tetap tertaut.`
      )}`
    );
  }

  await db.query(`DELETE FROM format_profiles WHERE id = $1`, [profileId]);
  await logAudit(session, "format_profile_delete", {
    target_table: "format_profiles",
    target_id: profileId,
    details: { name: p.name },
  });

  revalidatePath("/format-profiles");
  redirect(`/format-profiles?msg=${encodeURIComponent(`Profile "${p.name}" dihapus`)}`);
}

export async function updateProfileConfigAction(profileId: number, formData: FormData) {
  const session = requireGlobal();

  const name = String(formData.get("name") ?? "").trim();
  const bankHint = String(formData.get("bank_hint") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const patternsRaw = String(formData.get("detect_patterns") ?? "").trim();
  const configRaw = String(formData.get("config") ?? "").trim();

  if (!name) redirect(`/format-profiles/${profileId}?err=Nama%20wajib`);

  // Parse detect_patterns (1 per line)
  const detectPatterns = patternsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (detectPatterns.length === 0) {
    redirect(`/format-profiles/${profileId}?err=${encodeURIComponent("Minimal 1 detect pattern")}`);
  }

  // Validate config JSON
  let config: unknown;
  try {
    config = JSON.parse(configRaw);
  } catch (e: any) {
    redirect(`/format-profiles/${profileId}?err=${encodeURIComponent("JSON config invalid: " + e.message)}`);
  }

  // Validate regex patterns compile
  for (const p of detectPatterns) {
    try { new RegExp(p, "i"); } catch (e: any) {
      redirect(`/format-profiles/${profileId}?err=${encodeURIComponent(`Regex invalid: ${p} → ${e.message}`)}`);
    }
  }

  try {
    await db.query(
      `UPDATE format_profiles
          SET name = $1, bank_hint = $2, notes = $3,
              detect_patterns = $4, config = $5::jsonb
        WHERE id = $6`,
      [name, bankHint, notes, detectPatterns, JSON.stringify(config), profileId]
    );
  } catch (e: any) {
    if (e.code === "23505") {
      redirect(`/format-profiles/${profileId}?err=${encodeURIComponent("Nama profile sudah dipakai")}`);
    }
    throw e;
  }

  await logAudit(session, "format_profile_update", {
    target_table: "format_profiles",
    target_id: profileId,
    details: { name },
  });

  revalidatePath("/format-profiles");
  redirect(`/format-profiles/${profileId}?msg=Profile%20diperbarui`);
}
