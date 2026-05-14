// Zod schemas untuk validasi form input.

import { z } from "zod";

export const BranchSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100),
  code: z.string().trim().min(2, "Kode minimal 2 karakter").max(16)
    .regex(/^[A-Za-z0-9-]+$/, "Kode hanya huruf, angka, dan strip"),
  pic_name: z.string().trim().min(2, "Nama PIC minimal 2 karakter").max(100),
  pic_phone: z.string().trim().max(30).optional().nullable(),
  status: z.enum(["aktif", "nonaktif", "review"]),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const AccountSchema = z.object({
  branch_id: z.number().int().positive(),
  bank: z.string().trim().min(2, "Bank wajib").max(50),
  account_number: z.string().trim().min(5, "Min 5 digit").max(30)
    .regex(/^\d+$/, "Hanya angka, tanpa spasi/strip"),
  account_holder: z.string().trim().min(2).max(100),
  purpose: z.string().trim().min(2, "Peruntukan wajib").max(100),
  status: z.enum(["aktif", "nonaktif"]),
});

export const CategorySchema = z.object({
  name: z.string().trim().min(2).max(50),
  type: z.enum(["masuk", "keluar", "keduanya"]),
  keywords_raw: z.string().trim().max(500).optional().nullable(), // comma-separated
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Format warna #rrggbb"),
  priority: z.coerce.number().int().min(0).max(999),
});

export function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k.length > 0);
}

export const ResetCodeSchema = z.object({
  scope: z.enum(["global", "branch"]),
  branch_id: z.coerce.number().int().positive().optional(),
  new_code: z.string().regex(/^\d{8}$/, "Harus 8 digit angka"),
});
