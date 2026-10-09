// Detail per bulan untuk Laporan Fiskal:
//  - General Ledger: transaksi per akun (COA) dalam 1 bulan
//  - Statement of Activity: ringkasan revenue/expense/net bulan itu
// Dipakai page /fiskal/bulan + export Excel & PDF.

import { query } from "./db";
import { getRates, convertCurrency, toNumber, type RateMap } from "./exchange-rate";
import { effKind, type CatRow } from "./fiscal";

export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export interface LedgerTxn {
  date: string;
  desc: string;
  expense: number;
  income: number;
  balance: number;
}
export interface LedgerAccount {
  code: string | null;
  name: string;
  kind: "revenue" | "expense" | "other";
  txns: LedgerTxn[];
  totExpense: number;
  totIncome: number;
}
export interface SoACat { code: string | null; name: string; total: number }
export interface SoABlock { name: string; kind: "revenue" | "expense" | "other"; cats: SoACat[]; subtotal: number }

export interface MonthDetail {
  year: number;
  month: number;
  monthName: string;
  displayCurrency: string;
  soaBlocks: SoABlock[];
  revTotal: number;
  expTotal: number;
  net: number;
  ledger: LedgerAccount[];
}

export async function computeMonthDetail(opts: {
  year: number;
  month: number;
  filterBranchId: number | null;
  displayCurrency: string;
  rates?: RateMap;
}): Promise<MonthDetail> {
  const { year, month, filterBranchId, displayCurrency } = opts;
  const rates = opts.rates ?? (await getRates());
  const conv = (amt: string | number, cur: string) => convertCurrency(toNumber(amt), cur, displayCurrency, rates) ?? toNumber(amt);

  const cats = await query<CatRow>(
    `SELECT c.id, c.name, c.type, c.account_code, c.group_id,
            g.name AS group_name, g.kind, g.display_order AS group_order
       FROM categories c
       LEFT JOIN category_groups g ON g.id = c.group_id
      WHERE c.group_id IS NOT NULL
      ORDER BY g.display_order NULLS LAST, c.account_code NULLS LAST, c.priority, c.name`
  );

  const txParams: unknown[] = [year, month];
  let branchClause = "";
  if (filterBranchId) {
    txParams.push(filterBranchId);
    branchClause = `AND t.branch_id = $3`;
  }
  const txns = await query<{
    category_id: number;
    tx_date: string;
    description: string;
    debit: string;
    credit: string;
    currency: string;
  }>(
    `SELECT t.category_id, t.tx_date::TEXT AS tx_date, t.description, t.debit, t.credit, t.currency
       FROM transactions t
      WHERE t.archived_at IS NULL
        AND EXTRACT(YEAR FROM t.tx_date) = $1 AND EXTRACT(MONTH FROM t.tx_date) = $2 ${branchClause}
      ORDER BY t.tx_date ASC, t.id ASC`,
    txParams
  );

  const byCat = new Map<number, { income: number; expense: number }[]>();
  const txByCat = new Map<number, { date: string; desc: string; income: number; expense: number }[]>();
  for (const t of txns) {
    const income = conv(t.credit, t.currency);
    const expense = conv(t.debit, t.currency);
    const arr = txByCat.get(t.category_id) ?? [];
    arr.push({ date: t.tx_date, desc: t.description, income, expense });
    txByCat.set(t.category_id, arr);
  }

  // Ledger per akun (semua akun COA, termasuk yang kosong → mirror template)
  const ledger: LedgerAccount[] = cats.map((c) => {
    const kind = effKind(c);
    const list = txByCat.get(c.id) ?? [];
    let bal = 0;
    let totIncome = 0;
    let totExpense = 0;
    const rows: LedgerTxn[] = list.map((t) => {
      bal += t.income - t.expense;
      totIncome += t.income;
      totExpense += t.expense;
      return { date: t.date, desc: t.desc, income: t.income, expense: t.expense, balance: bal };
    });
    return { code: c.account_code, name: c.name, kind, txns: rows, totIncome, totExpense };
  });

  // Statement of Activity: blok grup → kategori dengan total bulan
  const blocks: SoABlock[] = [];
  const idx = new Map<string, SoABlock>();
  let revTotal = 0;
  let expTotal = 0;
  for (const c of cats) {
    const kind = effKind(c);
    const key = c.group_name ?? "Lainnya";
    let blk = idx.get(key);
    if (!blk) {
      blk = { name: key, kind, cats: [], subtotal: 0 };
      idx.set(key, blk);
      blocks.push(blk);
    }
    const acc = ledger.find((l) => l.code === c.account_code && l.name === c.name);
    const total = kind === "revenue" ? acc?.totIncome ?? 0 : kind === "expense" ? acc?.totExpense ?? 0 : (acc?.totIncome ?? 0) - (acc?.totExpense ?? 0);
    blk.cats.push({ code: c.account_code, name: c.name, total });
    blk.subtotal += total;
    if (kind === "revenue") revTotal += total;
    else if (kind === "expense") expTotal += total;
  }

  return {
    year,
    month,
    monthName: MONTH_NAMES_ID[month - 1] ?? String(month),
    displayCurrency,
    soaBlocks: blocks,
    revTotal,
    expTotal,
    net: revTotal - expTotal,
    ledger,
  };
}
