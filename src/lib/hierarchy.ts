// Helper untuk cascade filter dropdown di Dashboard, Laporan, Transaksi.
// Load options per level berdasarkan parent yang sudah dipilih.

import { query } from "@/lib/db";

export interface CascadeFilters {
  branchId?: number | null;
  segmentId?: number | null;
  subId?: number | null;
  accountId?: number | null;
}

export interface CascadeOptions {
  branches: { id: number; name: string; code: string }[];
  segments: { id: number; name: string; branch_id: number }[];
  subs: { id: number; name: string; segment_id: number }[];
  accounts: { id: number; bank: string; account_number: string; purpose: string; currency: string; sub_segment_id: number }[];
}

/**
 * Load cascade options sesuai filter aktif.
 * Branch role auto-lock ke cabangnya.
 */
export async function getCascadeOptions(
  filters: CascadeFilters,
  role: "global" | "branch",
  sessionBranchId?: number
): Promise<CascadeOptions> {
  // Branches
  const branches = role === "branch" && sessionBranchId
    ? await query<{ id: number; name: string; code: string }>(
        `SELECT id, name, code FROM branches WHERE id = $1`,
        [sessionBranchId]
      )
    : await query<{ id: number; name: string; code: string }>(
        `SELECT id, name, code FROM branches WHERE status = 'aktif' ORDER BY name`
      );

  // Lock branchId untuk branch role
  const effectiveBranchId = role === "branch" ? sessionBranchId : filters.branchId;

  // Segments — filter ke branch yang dipilih (kalau ada)
  const segments = effectiveBranchId
    ? await query<{ id: number; name: string; branch_id: number }>(
        `SELECT id, name, branch_id FROM segments
          WHERE branch_id = $1 AND status = 'aktif'
          ORDER BY display_order, name`,
        [effectiveBranchId]
      )
    : [];

  // Sub segments — filter ke segment yang dipilih
  const subs = filters.segmentId
    ? await query<{ id: number; name: string; segment_id: number }>(
        `SELECT id, name, segment_id FROM sub_segments
          WHERE segment_id = $1 AND status = 'aktif'
          ORDER BY display_order, name`,
        [filters.segmentId]
      )
    : [];

  // Accounts — filter ke sub yang dipilih (atau scope branch kalau sub belum dipilih)
  let accounts: CascadeOptions["accounts"] = [];
  if (filters.subId) {
    accounts = await query(
      `SELECT id, bank, account_number, purpose, currency, sub_segment_id
         FROM accounts
        WHERE sub_segment_id = $1 AND status = 'aktif'
        ORDER BY bank, account_number`,
      [filters.subId]
    );
  } else if (effectiveBranchId) {
    accounts = await query(
      `SELECT id, bank, account_number, purpose, currency, sub_segment_id
         FROM accounts
        WHERE branch_id = $1 AND status = 'aktif'
        ORDER BY bank, account_number`,
      [effectiveBranchId]
    );
  }

  return { branches, segments, subs, accounts };
}

/**
 * Build WHERE clause untuk filter transactions berdasarkan cascade.
 * Returns parts + params array (untuk di-spread ke param list).
 */
export function buildTxWhere(
  filters: CascadeFilters,
  startParamIndex: number
): { whereParts: string[]; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startParamIndex;

  if (filters.branchId) {
    params.push(filters.branchId);
    parts.push(`t.branch_id = $${idx++}`);
  }
  if (filters.segmentId) {
    // Join ke accounts → sub_segments → check segment_id
    params.push(filters.segmentId);
    parts.push(`EXISTS (
      SELECT 1 FROM accounts a
      JOIN sub_segments ss ON ss.id = a.sub_segment_id
      WHERE a.id = t.account_id AND ss.segment_id = $${idx++}
    )`);
  }
  if (filters.subId) {
    params.push(filters.subId);
    parts.push(`EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = t.account_id AND a.sub_segment_id = $${idx++}
    )`);
  }
  if (filters.accountId) {
    params.push(filters.accountId);
    parts.push(`t.account_id = $${idx++}`);
  }

  return { whereParts: parts, params };
}

/**
 * Helper: tampilkan path lengkap akun "Cabang › Tipe › Sub › Bank XXXX".
 */
export function formatAccountPath(parts: {
  branch_code?: string;
  branch_name?: string;
  segment_name?: string;
  sub_name?: string;
  bank?: string;
  account_number?: string;
  purpose?: string;
}): string {
  const last4 = parts.account_number ? parts.account_number.slice(-4) : "";
  const acc = parts.bank ? `${parts.bank} · ${last4}` : "";
  return [
    parts.branch_name || parts.branch_code,
    parts.segment_name,
    parts.sub_name,
    acc,
  ]
    .filter(Boolean)
    .join(" › ");
}
