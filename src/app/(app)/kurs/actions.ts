"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, queryOne } from "@/lib/db";
import { requireGlobal } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const RateSchema = z.object({
  currency_code: z.string().trim().toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency 3 huruf ISO 4217"),
  rate_to_usd: z.coerce.number().positive("Rate harus > 0"),
  notes: z.string().trim().max(200).optional().nullable(),
});

export async function upsertRateAction(formData: FormData) {
  const session = requireGlobal();

  const parsed = RateSchema.safeParse({
    currency_code: formData.get("currency_code"),
    rate_to_usd: formData.get("rate_to_usd"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) {
    redirect(`/kurs?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")}`);
  }

  const d = parsed.data;

  await db.query(
    `INSERT INTO exchange_rates (currency_code, rate_to_usd, notes, updated_by_role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (currency_code) DO UPDATE
        SET rate_to_usd = EXCLUDED.rate_to_usd,
            notes = EXCLUDED.notes,
            updated_by_role = EXCLUDED.updated_by_role,
            updated_at = NOW()`,
    [d.currency_code, d.rate_to_usd, d.notes, session.role]
  );

  await logAudit(session, "upsert_exchange_rate", {
    target_table: "exchange_rates",
    details: d,
  });

  revalidatePath("/kurs");
  revalidatePath("/dashboard");
  revalidatePath("/laporan");
  revalidatePath("/transaksi");
  redirect(`/kurs?msg=${encodeURIComponent(`Rate ${d.currency_code} berhasil di-update`)}`);
}

export async function deleteRateAction(currencyCode: string) {
  const session = requireGlobal();

  if (currencyCode.toUpperCase() === "USD") {
    redirect(`/kurs?err=${encodeURIComponent("USD adalah base currency, tidak bisa dihapus")}`);
  }

  // Cek apakah ada akun yang masih pakai currency ini
  const inUse = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM accounts WHERE UPPER(currency) = $1`,
    [currencyCode.toUpperCase()]
  );
  if (Number(inUse?.count ?? 0) > 0) {
    redirect(
      `/kurs?err=${encodeURIComponent(
        `${currencyCode} masih dipakai ${inUse?.count} rekening. Hapus rekening dulu atau biarkan saja (rate tidak akan dipakai kalau view native).`
      )}`
    );
  }

  await db.query(`DELETE FROM exchange_rates WHERE currency_code = $1`, [currencyCode.toUpperCase()]);
  await logAudit(session, "delete_exchange_rate", {
    target_table: "exchange_rates",
    details: { currency_code: currencyCode },
  });

  revalidatePath("/kurs");
  redirect(`/kurs?msg=${encodeURIComponent(`Rate ${currencyCode} dihapus`)}`);
}
