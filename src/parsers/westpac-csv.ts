// Adapter untuk Westpac Australia CSV (dan bank AU sejenis dengan format flat).
//
// Struktur file:
//   Row 1  : Header column names — "Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial"
//   Row 2+ : Data — account,date,narrative,debit,credit,balance,category,serial
//
// Contoh:
//   Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial
//   032157360625,17/07/2026,"DEPOSIT-OSKO PAYMENT 2686772 SUSY LIM Tithe",,614.00,46729.14,DEP,
//   032157360625,16/07/2026,"WITHDRAWAL-OSKO PAYMENT 1234 REIMBURSEMENT",50.00,,45820.14,PAYMENT,
//
// Karakteristik:
// - Account number 12 digit, ada di kolom 0 SETIAP baris (biasanya sama semua)
// - Tidak ada period metadata — derive dari min/max tx_date
// - Currency implicit AUD (Westpac Australia)
// - Date format DD/MM/YYYY penuh (bukan DD/MM saja)
// - Amount pakai comma sebagai thousand separator, dot sebagai decimal

import Papa from "papaparse";
import type { ParseAdapter, ParseResult, ParsedTransaction } from "./types";

const HEADER_SIGNATURE = ["Bank Account", "Date", "Narrative", "Debit Amount", "Credit Amount", "Balance"];

export const westpacCsvAdapter: ParseAdapter = {
  name: "westpac-csv",

  detect(content: string, _filename: string): boolean {
    // Signature: first non-empty line harus punya kolom-kolom khas Westpac
    const firstLine = content.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    // Split naive — signature semua ASCII tanpa quote di header
    const cols = firstLine.split(",").map((c) => c.trim());
    return HEADER_SIGNATURE.every((h, i) => (cols[i] ?? "").toLowerCase() === h.toLowerCase());
  },

  parse(content: string): ParseResult {
    const parsedCsv = Papa.parse<string[]>(content, { skipEmptyLines: "greedy" });
    const rows = parsedCsv.data.map((r) => r.map((c) => (c ?? "").trim()));

    if (rows.length < 2) {
      throw new Error("File Westpac CSV kosong atau hanya header");
    }

    // Row 0 = header column names, verify
    const header = rows[0];
    if (!HEADER_SIGNATURE.every((h, i) => (header[i] ?? "").toLowerCase() === h.toLowerCase())) {
      throw new Error("Header kolom tidak sesuai format Westpac");
    }

    let accountNumber = "";
    const transactions: ParsedTransaction[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 6) continue;

      const acc = (row[0] ?? "").replace(/\D+/g, "");
      const dateRaw = (row[1] ?? "").trim();
      const narrative = (row[2] ?? "").trim();
      const debitRaw = (row[3] ?? "").trim();
      const creditRaw = (row[4] ?? "").trim();
      const balanceRaw = (row[5] ?? "").trim();

      if (!acc || !dateRaw || !narrative) continue;

      if (!accountNumber) accountNumber = acc;
      // Kalau akun di baris ini beda dari baris pertama — skip (bank kadang gabung multi-account, kita ambil yg paling banyak)
      // Untuk simplicity, tetap pakai account dari baris pertama
      if (acc !== accountNumber) continue;

      const txDate = parseDate(dateRaw);
      if (!txDate) continue;

      const debit = parseAmount(debitRaw);
      const credit = parseAmount(creditRaw);

      if (debit === 0 && credit === 0) continue; // baris kosong

      const direction: "in" | "out" = credit > 0 ? "in" : "out";
      const balance = balanceRaw ? parseAmount(balanceRaw) : null;

      transactions.push({
        tx_date: txDate,
        tx_time: null,
        description: narrative,
        description_normalized: narrative.replace(/\s+/g, " ").trim().toUpperCase(),
        bank_branch_code: null,
        debit,
        credit,
        balance: balance !== null && !isNaN(balance) ? balance : null,
        direction,
      });
    }

    if (!accountNumber) throw new Error("Nomor rekening tidak ditemukan di file Westpac CSV");
    if (transactions.length === 0) throw new Error("Tidak ada transaksi terdeteksi");

    // Derive period dari min/max tx_date
    const sortedDates = transactions.map((t) => t.tx_date).sort();
    const dateFrom = sortedDates[0];
    const dateTo = sortedDates[sortedDates.length - 1];

    // Derive opening/closing balance dari sorted transactions
    const sortedTx = [...transactions].sort((a, b) => a.tx_date.localeCompare(b.tx_date));
    let openingBalance: number | null = null;
    let closingBalance: number | null = null;

    const firstWithBalance = sortedTx.find((t) => t.balance !== null);
    if (firstWithBalance) {
      // opening = balance setelah tx pertama - net dari tx pertama
      openingBalance = firstWithBalance.balance! - firstWithBalance.credit + firstWithBalance.debit;
    }
    for (let i = sortedTx.length - 1; i >= 0; i--) {
      if (sortedTx[i].balance !== null) {
        closingBalance = sortedTx[i].balance;
        break;
      }
    }

    const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
    const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
    const totalDebitCount = transactions.filter((t) => t.debit > 0).length;
    const totalCreditCount = transactions.filter((t) => t.credit > 0).length;

    return {
      parser_name: "westpac-csv",
      account_number: accountNumber,
      currency: "AUD",
      date_from: dateFrom,
      date_to: dateTo,
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

// ─── Helpers ───

function parseDate(raw: string): string | null {
  // "17/07/2026" → "2026-07-17"
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
