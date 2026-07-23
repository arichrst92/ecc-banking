// BCA CSV parser — referensi fixture: fixtures/bca/CorpAcctTrxn202419113919972.csv
//
// Format file:
//   "Informasi Rekening - Mutasi Rekening"," "," "," "," ",
//   (baris kosong)
//   "No. rekening : 5860660999"
//   "Nama : PT AKTIF BANGUN CITRA"
//   "Periode : 01/11/2023 - 30/11/2023"
//   "Kode Mata Uang : Rp"
//   "Tanggal Transaksi","Keterangan","Cabang","Jumlah","Saldo"
//   "03/11","TRSF E-BANKING DB 0311/...","5860","7,083,000.00 DB","214,514,845.46"
//   ... (tx rows)
//   "Saldo Awal : 221,597,845.46"
//   "Mutasi Debet : 472,571,275.00","42"
//   "Mutasi Kredit : 373,704,497.00","5"
//   "Saldo Akhir : 122,731,067.46"
//
// Karakteristik:
//   - Tanggal hanya DD/MM (tahun harus di-derive dari Periode di header)
//   - Tidak ada kolom jam
//   - Jumlah pakai suffix "DB" (debit) atau "CR" (credit)
//   - Footer kasih total + count untuk validasi parser

import Papa from "papaparse";
import type { ParseAdapter, ParseResult, ParsedTransaction } from "./types";

const TABLE_HEADER = ["Tanggal Transaksi", "Keterangan", "Cabang", "Jumlah", "Saldo"];

export const bcaCsvAdapter: ParseAdapter = {
  name: "bca-csv",

  detect(content: string): boolean {
    const head = content.slice(0, 2000);
    return /Informasi Rekening/i.test(head) || /No\.\s*rekening\s*:/i.test(head);
  },

  parse(content: string): ParseResult {
    const result = Papa.parse<string[]>(content, { skipEmptyLines: "greedy" });
    const rows = result.data;

    let accountNumber = "";
    let currency = "IDR";
    let periodFrom: string | null = null;
    let periodTo: string | null = null;
    let openingBalance: number | null = null;
    let closingBalance: number | null = null;
    let totalDebit: number | null = null;
    let totalCredit: number | null = null;
    let totalDebitCount: number | null = null;
    let totalCreditCount: number | null = null;

    const transactions: ParsedTransaction[] = [];
    let inTable = false;

    for (const row of rows) {
      const cell0 = (row[0] ?? "").trim();

      if (!inTable) {
        // Header metadata
        let m = cell0.match(/^No\.\s*rekening\s*:\s*(\d+)/i);
        if (m) { accountNumber = m[1].replace(/\D+/g, ""); continue; }

        m = cell0.match(/^Periode\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (m) {
          periodFrom = toISODate(m[1]);
          periodTo = toISODate(m[2]);
          continue;
        }

        m = cell0.match(/^Kode Mata Uang\s*:\s*(\S+)/i);
        if (m) { currency = normalizeCurrency(m[1]); continue; }

        // Detect start of table
        if (TABLE_HEADER.every((c, i) => (row[i] ?? "").trim() === c)) {
          inTable = true;
          continue;
        }
        continue;
      }

      // ── In table ──
      // Footer rows
      let m = cell0.match(/^Saldo Awal\s*:\s*([\d,]+\.?\d*)/i);
      if (m) { openingBalance = parseAmount(m[1]); continue; }

      m = cell0.match(/^Mutasi Debet\s*:\s*([\d,]+\.?\d*)/i);
      if (m) {
        totalDebit = parseAmount(m[1]);
        totalDebitCount = parseInt((row[1] ?? "0").trim(), 10) || null;
        continue;
      }

      m = cell0.match(/^Mutasi Kredit\s*:\s*([\d,]+\.?\d*)/i);
      if (m) {
        totalCredit = parseAmount(m[1]);
        totalCreditCount = parseInt((row[1] ?? "0").trim(), 10) || null;
        continue;
      }

      m = cell0.match(/^Saldo Akhir\s*:\s*([\d,]+\.?\d*)/i);
      if (m) { closingBalance = parseAmount(m[1]); continue; }

      // Transaction row
      if (row.length < 5) continue;
      const tx = parseTxRow(row, periodFrom);
      if (tx) transactions.push(tx);
    }

    if (!accountNumber) throw new Error("Nomor rekening tidak ditemukan di file");
    if (!periodFrom || !periodTo) throw new Error("Periode tidak ditemukan di file");
    if (transactions.length === 0) throw new Error("Tidak ada transaksi terdeteksi di file");

    return {
      parser_name: "bca-csv",
      account_number: accountNumber,
      currency,
      date_from: periodFrom,
      date_to: periodTo,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      total_debit_period: totalDebit,
      total_credit_period: totalCredit,
      total_debit_count: totalDebitCount,
      total_credit_count: totalCreditCount,
      transactions,
    };
  },
};

function toISODate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

function normalizeCurrency(raw: string): string {
  const trim = (raw ?? "").toString().trim().toUpperCase();
  if (trim === "RP" || trim === "IDR") return "IDR";
  if (trim === "USD" || trim === "$") return "USD";
  if (trim === "SGD" || trim === "S$") return "SGD";
  if (trim === "EUR" || trim === "€") return "EUR";
  return trim;
}

function parseTxRow(row: string[], periodFrom: string | null): ParsedTransaction | null {
  const dateRaw = (row[0] ?? "").trim();
  const desc = (row[1] ?? "").trim();
  const branchCode = (row[2] ?? "").trim();
  const amountRaw = (row[3] ?? "").trim();
  const balanceRaw = (row[4] ?? "").trim();

  if (!dateRaw || !desc || !amountRaw) return null;

  // Date: "DD/MM" → derive year from periodFrom
  const dm = dateRaw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!dm) return null;
  const dd = parseInt(dm[1], 10);
  const mm = parseInt(dm[2], 10);

  let year: number;
  if (periodFrom) {
    const periodYear = parseInt(periodFrom.split("-")[0], 10);
    const periodMonth = parseInt(periodFrom.split("-")[1], 10);
    year = periodYear;
    // Period spans year boundary (Dec → Jan): tx month earlier than period start → use next year
    if (mm < periodMonth) year++;
  } else {
    year = new Date().getFullYear();
  }
  const txDate = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

  // Amount: "7,083,000.00 DB" / "91,212,000.00 CR"
  const am = amountRaw.match(/^([\d,]+\.?\d*)\s*(DB|CR)$/i);
  if (!am || !am[1] || !am[2]) return null;
  const amount = parseAmount(am[1]);
  const direction = am[2].toUpperCase() === "CR" ? "in" : "out";

  const balance = balanceRaw ? parseAmount(balanceRaw) : null;
  const description_normalized = desc.replace(/\s+/g, " ").trim().toUpperCase();

  return {
    tx_date: txDate,
    tx_time: null,
    description: desc,
    description_normalized,
    bank_branch_code: branchCode || null,
    debit: direction === "out" ? amount : 0,
    credit: direction === "in" ? amount : 0,
    balance,
    direction,
  };
}
