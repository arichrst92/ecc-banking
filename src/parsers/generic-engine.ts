// Generic parser engine: apply FormatProfileConfig ke isi file CSV.
// Engine ini deklaratif — tidak ada eval/dynamic code. Aman secure.

import Papa from "papaparse";
import type { ParseResult, ParsedTransaction } from "./types";
import type {
  FormatProfileConfig,
  DateFormat,
  TimeFormat,
  CurrencyNormalize,
} from "./profile-config";

export function genericParse(
  content: string,
  config: FormatProfileConfig,
  parserName: string
): ParseResult {
  const parsedCsv = Papa.parse<string[]>(content, { skipEmptyLines: "greedy" });
  // Trim semua cells (HSBC kasih spasi di sekitar value)
  const rows = parsedCsv.data.map((r) => r.map((c) => (c ?? "").trim()));

  // ── Extract account_number, currency, period dari header ──
  let accountNumber = "";
  let currency = "IDR";
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (config.structure === "marker_based") {
    if (!config.markers) throw new Error("markers config wajib untuk marker_based");
    const mCol = config.markers.marker_column;
    const headerRow = rows.find((r) => r[mCol] === config.markers!.header_data);
    if (!headerRow) throw new Error(`Header row dengan marker "${config.markers.header_data}" tidak ditemukan`);

    accountNumber = extractAccountNumber(config.account_number, rows, headerRow);
    currency = extractCurrency(config.currency, rows, headerRow);
    const period = extractPeriod(config.period, rows, headerRow);
    dateFrom = period.from;
    dateTo = period.to;
  } else {
    // key_value_header or pure_table
    accountNumber = extractAccountNumber(config.account_number, rows);
    currency = extractCurrency(config.currency, rows);
    const period = extractPeriod(config.period, rows);
    dateFrom = period.from;
    dateTo = period.to;
  }

  if (!accountNumber) throw new Error("Nomor rekening tidak ditemukan");
  if (!dateFrom || !dateTo) throw new Error("Periode tidak ditemukan");

  // ── Iterate transactions rows ──
  const transactions: ParsedTransaction[] = [];
  let inTable = config.structure === "marker_based" || config.structure === "pure_table";

  for (const row of rows) {
    // Detect table start untuk key_value_header
    if (!inTable && config.structure === "key_value_header" && config.table_start) {
      const detect = config.table_start.detect;
      if (
        detect.length > 0 &&
        detect.every((c, i) => (row[i] ?? "") === c)
      ) {
        inTable = config.table_start.skip_until_after;
        continue;
      }
    }
    if (!inTable) continue;

    // Untuk marker_based: skip kalau marker bukan table_row
    if (config.structure === "marker_based") {
      const mCol = config.markers!.marker_column;
      if (row[mCol] !== config.markers!.table_row) continue;
    }

    // Untuk key_value_header: stop kalau ketemu footer line
    if (config.structure === "key_value_header") {
      const cell0 = row[0] ?? "";
      if (isFooterLine(cell0, config.footer)) {
        // Lanjut iterate untuk capture footer di pass terpisah
        continue;
      }
    }

    // Parse row sebagai transaksi
    try {
      const tx = parseRowAsTransaction(row, config, dateFrom);
      if (tx) transactions.push(tx);
    } catch {
      // Skip baris yang gagal parse (kemungkinan footer untuk marker_based)
    }
  }

  // ── Extract footer values ──
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let totalDebit: number | null = null;
  let totalCredit: number | null = null;
  let totalDebitCount: number | null = null;
  let totalCreditCount: number | null = null;

  if (config.footer) {
    if (config.footer.summary_marker) {
      // Mode marker_columns: cari baris dengan marker tertentu
      const mCol = config.markers?.marker_column ?? 0;
      const summaryRow = rows.find((r) => r[mCol] === config.footer!.summary_marker);
      if (summaryRow) {
        if (config.footer.summary_debit_column !== undefined) {
          totalDebit = parseNumber(summaryRow[config.footer.summary_debit_column] ?? "", config.number);
        }
        if (config.footer.summary_credit_column !== undefined) {
          totalCredit = parseNumber(summaryRow[config.footer.summary_credit_column] ?? "", config.number);
        }
      }
    } else {
      // Mode regex_lines: scan setiap baris untuk pattern
      for (const row of rows) {
        const cell0 = row[0] ?? "";
        if (config.footer.opening_balance) {
          const m = cell0.match(new RegExp(config.footer.opening_balance.pattern, "i"));
          if (m) openingBalance = parseNumber(m[config.footer.opening_balance.group ?? 1], config.number);
        }
        if (config.footer.closing_balance) {
          const m = cell0.match(new RegExp(config.footer.closing_balance.pattern, "i"));
          if (m) closingBalance = parseNumber(m[config.footer.closing_balance.group ?? 1], config.number);
        }
        if (config.footer.total_debit) {
          const m = cell0.match(new RegExp(config.footer.total_debit.pattern, "i"));
          if (m) {
            totalDebit = parseNumber(m[config.footer.total_debit.group ?? 1], config.number);
            // Count kemungkinan di column berikutnya
            if (config.footer.total_debit.count_pattern) {
              totalDebitCount = parseInt((row[1] ?? "0").trim(), 10) || null;
            } else if (row[1]) {
              totalDebitCount = parseInt(row[1], 10) || null;
            }
          }
        }
        if (config.footer.total_credit) {
          const m = cell0.match(new RegExp(config.footer.total_credit.pattern, "i"));
          if (m) {
            totalCredit = parseNumber(m[config.footer.total_credit.group ?? 1], config.number);
            if (row[1]) {
              totalCreditCount = parseInt(row[1], 10) || null;
            }
          }
        }
      }
    }
  }

  if (transactions.length === 0) {
    throw new Error("Tidak ada transaksi terdeteksi");
  }

  // ── Compute opening/closing balance dari transaksi kalau footer tidak menyediakan ──
  // Banyak bank (HSBC, dll) tidak kasih saldo awal/akhir eksplisit di footer.
  // Sebagai fallback: derive dari kolom 'balance' di transaksi pertama+terakhir kronologis.
  if (transactions.some((t) => t.balance !== null)) {
    // Sort by tx_date asc, then by index (stable)
    const sorted = transactions
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        if (a.t.tx_date !== b.t.tx_date) return a.t.tx_date.localeCompare(b.t.tx_date);
        return a.i - b.i;
      });

    if (openingBalance === null) {
      // opening = balance setelah tx pertama - net dari tx pertama
      // net = credit - debit (kalau credit menambah saldo)
      const first = sorted.find((x) => x.t.balance !== null);
      if (first) {
        openingBalance = first.t.balance! - first.t.credit + first.t.debit;
      }
    }

    if (closingBalance === null) {
      // closing = balance dari tx terakhir kronologis yang punya balance
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].t.balance !== null) {
          closingBalance = sorted[i].t.balance;
          break;
        }
      }
    }
  }

  // Compute total_debit / total_credit kalau footer tidak menyediakan
  if (totalDebit === null) {
    totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
  }
  if (totalCredit === null) {
    totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
  }
  if (totalDebitCount === null) {
    totalDebitCount = transactions.filter((t) => t.debit > 0).length;
  }
  if (totalCreditCount === null) {
    totalCreditCount = transactions.filter((t) => t.credit > 0).length;
  }

  return {
    parser_name: parserName,
    account_number: accountNumber,
    currency,
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
}

// ─── Helpers ───

function extractAccountNumber(
  spec: FormatProfileConfig["account_number"],
  rows: string[][],
  headerRow?: string[]
): string {
  if (spec.mode === "regex_line") {
    const re = new RegExp(spec.pattern, "i");
    for (const row of rows) {
      const m = (row[0] ?? "").match(re);
      if (m) return m[spec.group ?? 1].replace(/\s+/g, "");
    }
    return "";
  } else {
    if (!headerRow) return "";
    return (headerRow[spec.column] ?? "").replace(/\s+/g, "");
  }
}

function extractCurrency(
  spec: FormatProfileConfig["currency"],
  rows: string[][],
  headerRow?: string[]
): string {
  if (spec.mode === "fixed") {
    return spec.value.toUpperCase();
  }
  let raw = "";
  if (spec.mode === "regex_line") {
    const re = new RegExp(spec.pattern, "i");
    for (const row of rows) {
      const m = (row[0] ?? "").match(re);
      if (m) { raw = m[spec.group ?? 1]; break; }
    }
  } else if (spec.mode === "marker_column" && headerRow) {
    raw = headerRow[spec.column] ?? "";
  }
  raw = raw.trim().toUpperCase();
  if (spec.normalize) {
    for (const n of spec.normalize) {
      if (raw === n.from.toUpperCase()) return n.to.toUpperCase();
    }
  }
  // Auto-normalize common
  if (raw === "RP") return "IDR";
  if (raw === "$") return "USD";
  return raw || "IDR";
}

function extractPeriod(
  spec: FormatProfileConfig["period"],
  rows: string[][],
  headerRow?: string[]
): { from: string | null; to: string | null } {
  if (spec.mode === "regex_line") {
    const re = new RegExp(spec.pattern, "i");
    for (const row of rows) {
      const m = (row[0] ?? "").match(re);
      if (m) {
        return {
          from: convertDate(m[spec.from_group], spec.date_format),
          to: convertDate(m[spec.to_group], spec.date_format),
        };
      }
    }
    return { from: null, to: null };
  } else {
    if (!headerRow) return { from: null, to: null };
    return {
      from: convertDate(headerRow[spec.from_column] ?? "", spec.date_format),
      to: convertDate(headerRow[spec.to_column] ?? "", spec.date_format),
    };
  }
}

function parseRowAsTransaction(
  row: string[],
  config: FormatProfileConfig,
  periodFrom: string | null
): ParsedTransaction | null {
  // Untuk marker_based, kita TIDAK skip kolom marker — config.columns.tx_date.index harus include marker offset
  const cols = config.columns;

  const dateRaw = row[cols.tx_date.index] ?? "";
  const txDate = convertDate(dateRaw, config.tx_date_format, periodFrom);
  if (!txDate) return null;

  let txTime: string | null = null;
  if (cols.tx_time && config.tx_time_format) {
    txTime = convertTime(row[cols.tx_time.index] ?? "", config.tx_time_format);
  }

  // Description (maybe join multiple cols)
  let description = (row[cols.description.index] ?? "").trim();
  if (cols.description.extra_indices) {
    const extras = cols.description.extra_indices
      .map((i) => (row[i] ?? "").trim())
      .filter((s) => s.length > 0);
    if (extras.length > 0) description = [description, ...extras].join(" | ");
  }
  if (!description) return null;

  const bankBranchCode = cols.bank_branch_code
    ? (row[cols.bank_branch_code.index] ?? "").trim() || null
    : null;

  // Amount: variant A (suffix) atau variant B (separate debit/credit)
  let debit = 0;
  let credit = 0;
  let direction: "in" | "out" = "out";

  if (cols.amount_with_suffix) {
    const ar = (row[cols.amount_with_suffix.index] ?? "").trim();
    const dm = cols.amount_with_suffix.direction_marker_debit ?? "DB";
    const cm = cols.amount_with_suffix.direction_marker_credit ?? "CR";
    const re = new RegExp(`^([\\d,.]+)\\s*(${escapeRe(dm)}|${escapeRe(cm)})$`, "i");
    const m = ar.match(re);
    if (!m) return null;
    const amount = parseNumber(m[1], config.number);
    if (m[2].toUpperCase() === cm.toUpperCase()) {
      direction = "in"; credit = amount;
    } else {
      direction = "out"; debit = amount;
    }
  } else if (cols.debit && cols.credit) {
    debit = parseNumber(row[cols.debit.index] ?? "0", config.number);
    credit = parseNumber(row[cols.credit.index] ?? "0", config.number);
    if (credit > 0 && debit === 0) direction = "in";
    else if (debit > 0 && credit === 0) direction = "out";
    else if (credit === 0 && debit === 0) return null; // baris kosong
    else {
      // Kalau dua-duanya > 0, prioritaskan yang lebih besar (edge case)
      direction = credit > debit ? "in" : "out";
    }
  } else {
    return null;
  }

  let balance: number | null = null;
  if (cols.balance) {
    balance = parseNumber(row[cols.balance.index] ?? "", config.number);
    if (isNaN(balance)) balance = null;
  }

  return {
    tx_date: txDate,
    tx_time: txTime,
    description,
    description_normalized: description.replace(/\s+/g, " ").trim().toUpperCase(),
    bank_branch_code: bankBranchCode,
    debit,
    credit,
    balance,
    direction,
  };
}

function isFooterLine(cell0: string, footer?: FormatProfileConfig["footer"]): boolean {
  if (!footer) return false;
  for (const key of ["opening_balance", "closing_balance", "total_debit", "total_credit"] as const) {
    const spec = (footer as any)[key];
    if (spec?.pattern && new RegExp(spec.pattern, "i").test(cell0)) return true;
  }
  return false;
}

function parseNumber(
  raw: string,
  fmt: FormatProfileConfig["number"]
): number {
  if (!raw) return 0;
  let s = raw.trim();
  // Hapus thousand separator
  if (fmt.thousand_separator) s = s.split(fmt.thousand_separator).join("");
  // Replace decimal kalau bukan "."
  if (fmt.decimal_separator !== ".") s = s.replace(fmt.decimal_separator, ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function convertDate(raw: string, fmt: DateFormat, periodFrom?: string | null): string | null {
  raw = raw.trim();
  if (!raw) return null;
  let dd = 0, mm = 0, yyyy = 0;

  if (fmt === "DD/MM/YYYY" || fmt === "DD-MM-YYYY") {
    const sep = fmt.includes("/") ? "/" : "-";
    const [d, m, y] = raw.split(sep);
    if (!d || !m || !y) return null;
    dd = parseInt(d, 10); mm = parseInt(m, 10); yyyy = parseInt(y, 10);
  } else if (fmt === "YYYY-MM-DD") {
    const [y, m, d] = raw.split("-");
    if (!d || !m || !y) return null;
    yyyy = parseInt(y, 10); mm = parseInt(m, 10); dd = parseInt(d, 10);
  } else if (fmt === "MM/DD/YYYY") {
    const [m, d, y] = raw.split("/");
    if (!d || !m || !y) return null;
    mm = parseInt(m, 10); dd = parseInt(d, 10); yyyy = parseInt(y, 10);
  } else if (fmt === "DD/MM") {
    const [d, m] = raw.split("/");
    if (!d || !m) return null;
    dd = parseInt(d, 10); mm = parseInt(m, 10);
    if (periodFrom) {
      const periodYear = parseInt(periodFrom.split("-")[0], 10);
      const periodMonth = parseInt(periodFrom.split("-")[1], 10);
      yyyy = periodYear;
      if (mm < periodMonth) yyyy++; // period span Dec→Jan
    } else {
      yyyy = new Date().getFullYear();
    }
  } else {
    return null;
  }

  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function convertTime(raw: string, fmt: TimeFormat): string | null {
  raw = raw.trim();
  if (!raw) return null;
  if (fmt === "HH:MM:SS") return raw;
  if (fmt === "HH:MM") return raw + ":00";
  if (fmt === "HH:MM:SS_AM_PM") {
    // "09:55:31 AM"
    const m = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2], s = m[3], ap = m[4].toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}:${s}`;
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
