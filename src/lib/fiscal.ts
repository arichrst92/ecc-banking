// Shared logic Laporan Fiskal — dipakai page (/fiskal) & export Excel (/fiskal/export).

import { query } from "./db";
import { getRates, convertCurrency, toNumber, type RateMap } from "./exchange-rate";

export const FISCAL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type CatRow = {
  id: number;
  name: string;
  type: string;
  account_code: string | null;
  group_id: number | null;
  group_name: string | null;
  kind: string | null;
  group_order: number | null;
};

export type GroupBlock = {
  key: string;
  name: string;
  kind: "revenue" | "expense" | "other";
  cats: CatRow[];
};

export function effKind(c: { kind: string | null; type: string }): "revenue" | "expense" | "other" {
  if (c.kind === "revenue" || c.kind === "expense" || c.kind === "other") return c.kind;
  if (c.type === "masuk") return "revenue";
  if (c.type === "keluar") return "expense";
  return "other";
}

export interface FiscalMatrix {
  cats: CatRow[];
  kindByCat: Map<number, "revenue" | "expense" | "other">;
  actual: Map<number, number[]>;
  budget: Map<number, number[]>;
  blocks: GroupBlock[];
  rates: RateMap;
}

/**
 * Hitung matrix realisasi + anggaran per kategori × 12 bulan,
 * dikonversi ke displayCurrency. filterBranchId null = konsolidasi semua cabang.
 */
export async function computeFiscalMatrix(opts: {
  year: number;
  filterBranchId: number | null;
  displayCurrency: string;
  rates?: RateMap;
}): Promise<FiscalMatrix> {
  const { year, filterBranchId, displayCurrency } = opts;
  const rates = opts.rates ?? (await getRates());

  const cats = await query<CatRow>(
    `SELECT c.id, c.name, c.type, c.account_code, c.group_id,
            g.name AS group_name, g.kind, g.display_order AS group_order
       FROM categories c
       LEFT JOIN category_groups g ON g.id = c.group_id
      ORDER BY g.display_order NULLS LAST, c.account_code NULLS LAST, c.priority, c.name`
  );

  const actParams: unknown[] = [year];
  let actBranch = "";
  if (filterBranchId) {
    actParams.push(filterBranchId);
    actBranch = `AND t.branch_id = $2`;
  }
  const actRows = await query<{ category_id: number; mon: number; currency: string; cin: string; cout: string }>(
    `SELECT t.category_id, EXTRACT(MONTH FROM t.tx_date)::INT AS mon, t.currency,
            COALESCE(SUM(t.credit), 0)::TEXT AS cin,
            COALESCE(SUM(t.debit), 0)::TEXT AS cout
       FROM transactions t
      WHERE t.archived_at IS NULL AND EXTRACT(YEAR FROM t.tx_date) = $1 ${actBranch}
      GROUP BY t.category_id, mon, t.currency`,
    actParams
  );

  const budParams: unknown[] = [year];
  let budBranch = "";
  if (filterBranchId) {
    budParams.push(filterBranchId);
    budBranch = `AND branch_id = $2`;
  }
  const budRows = await query<{ category_id: number; month: number; currency: string; amt: string }>(
    `SELECT category_id, month, currency, SUM(amount)::TEXT AS amt
       FROM fiscal_budgets
      WHERE fiscal_year = $1 ${budBranch}
      GROUP BY category_id, month, currency`,
    budParams
  );

  const kindByCat = new Map<number, "revenue" | "expense" | "other">();
  for (const c of cats) kindByCat.set(c.id, effKind(c));

  const actual = new Map<number, number[]>();
  const budget = new Map<number, number[]>();
  const ensure = (m: Map<number, number[]>, id: number) => {
    let a = m.get(id);
    if (!a) {
      a = new Array(12).fill(0);
      m.set(id, a);
    }
    return a;
  };

  for (const r of actRows) {
    const kind = kindByCat.get(r.category_id) ?? "other";
    const raw =
      kind === "revenue" ? toNumber(r.cin) : kind === "expense" ? toNumber(r.cout) : toNumber(r.cin) - toNumber(r.cout);
    const conv = convertCurrency(raw, r.currency, displayCurrency, rates) ?? 0;
    ensure(actual, r.category_id)[r.mon - 1] += conv;
  }
  for (const r of budRows) {
    const conv = convertCurrency(toNumber(r.amt), r.currency, displayCurrency, rates) ?? 0;
    ensure(budget, r.category_id)[r.month - 1] += conv;
  }

  const blocks: GroupBlock[] = [];
  const blockIdx = new Map<string, GroupBlock>();
  for (const c of cats) {
    const key = c.group_id ? `g${c.group_id}` : "none";
    let blk = blockIdx.get(key);
    if (!blk) {
      blk = { key, name: c.group_name ?? "Lainnya (tanpa grup)", kind: effKind(c), cats: [] };
      blockIdx.set(key, blk);
      blocks.push(blk);
    }
    blk.cats.push(c);
  }

  return { cats, kindByCat, actual, budget, blocks, rates };
}
