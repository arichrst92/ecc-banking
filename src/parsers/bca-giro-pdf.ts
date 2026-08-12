// BCA "REKENING GIRO" e-statement PDF — referensi: ESTATEMENT_07325890088_202607.pdf
//
// Adapter ini menerima CSV hasil src/lib/pdf-extract.ts (satu baris visual PDF
// = satu baris CSV), bukan file PDF mentah.
//
// Bentuk dokumennya (berulang tiap halaman):
//   NO. REKENING : 7325890088
//   PERIODE      : JULI 2026
//   MATA UANG    : IDR
//   TANGGAL KETERANGAN CBG MUTASI SALDO       ← penanda awal tabel
//   01/07 SALDO AWAL 136,814,472.14
//   01/07 TRSF E-BANKING CR 0107/FTSCY/WS95031 1,129,000.00 137,943,472.14
//         1129000.00                           ← lanjutan keterangan
//         JUWITA MIKNEYA                       ← lanjutan keterangan
//   01/07 BIAYA ADM 0998 30,000.00 DB 137,913,472.14
//   Bersambung ke halaman berikut              ← penanda akhir tabel per halaman
//   ...
//   SALDO AWAL  : 136,814,472.14               ← footer, hanya di halaman terakhir
//   MUTASI CR   : 16,588,583.88 21
//   MUTASI DB   : 24,292,735.78 8
//   SALDO AKHIR : 129,110,320.24
//
// Empat hal yang membuat format ini tidak bisa ditangani generic-engine:
//
//   1. Satu transaksi menempati beberapa baris. Baris lanjutan tidak punya
//      tanggal dan harus digabung ke transaksi sebelumnya.
//   2. Kolom SALDO hanya diisi di transaksi terakhir per kelompok tanggal.
//      Baris lain kosong dan harus jadi NULL, bukan 0.
//   3. Hanya debit yang diberi penanda "DB". Kredit tidak punya penanda sama
//      sekali, sehingga pola amount_with_suffix milik generic-engine gagal.
//   4. Periode ditulis sebagai nama bulan ("JULI 2026"), bukan rentang tanggal,
//      dan tidak ada di enum DateFormat.
//
// Keterbatasan yang diketahui: kolom CBG tidak diekstrak (bank_branch_code
// selalu null). Nilainya jarang terisi dan memisahkannya dari keterangan
// setelah baris diratakan berisiko memotong teks yang bermakna.

import Papa from "papaparse";
import type { ParseAdapter, ParseResult, ParsedTransaction } from "./types";

const BULAN: Record<string, number> = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6,
  JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12,
};

/** Angka BCA selalu bergaya 1,234,567.89 — koma ribuan, titik desimal. */
const UANG = String.raw`[\d,]+\.\d{2}`;

export const bcaGiroPdfAdapter: ParseAdapter = {
  name: "bca-giro-pdf",

  detect(content: string): boolean {
    const head = flatten(content).slice(0, 40).join("\n");
    return (
      /NO\.\s*REKENING\s*:/i.test(head) &&
      /TANGGAL\s+KETERANGAN\s+CBG\s+MUTASI\s+SALDO/i.test(head)
    );
  },

  parse(content: string): ParseResult {
    const lines = flatten(content);

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
    let current: ParsedTransaction | null = null;
    let inTable = false;

    for (const line of lines) {
      // ── Metadata header (berulang di tiap halaman, aman kalau ter-set ulang) ──
      let m = line.match(/NO\.\s*REKENING\s*:\s*([\d\s-]+)/i);
      if (m) {
        accountNumber = m[1].replace(/\D+/g, "");
        continue;
      }

      m = line.match(/PERIODE\s*:\s*([A-Z]+)\s+(\d{4})/i);
      if (m) {
        const bulan = BULAN[m[1].toUpperCase()];
        const tahun = parseInt(m[2], 10);
        if (bulan && tahun) {
          periodFrom = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
          const hariTerakhir = new Date(tahun, bulan, 0).getDate();
          periodTo = `${tahun}-${String(bulan).padStart(2, "0")}-${hariTerakhir}`;
        }
        continue;
      }

      m = line.match(/MATA UANG\s*:\s*([A-Z$]+)/i);
      if (m) {
        currency = normalizeCurrency(m[1]);
        continue;
      }

      // ── Batas tabel ──
      if (/TANGGAL\s+KETERANGAN\s+CBG\s+MUTASI\s+SALDO/i.test(line)) {
        inTable = true;
        continue;
      }
      if (/Bersambung ke halaman berikut/i.test(line)) {
        inTable = false;
        current = null;
        continue;
      }

      // ── Footer ringkasan (hanya di halaman terakhir) ──
      m = line.match(new RegExp(String.raw`^SALDO AWAL\s*:\s*(${UANG})`, "i"));
      if (m) {
        openingBalance = toNumber(m[1]);
        inTable = false;
        current = null;
        continue;
      }
      m = line.match(new RegExp(String.raw`^SALDO AKHIR\s*:\s*(${UANG})`, "i"));
      if (m) {
        closingBalance = toNumber(m[1]);
        continue;
      }
      m = line.match(new RegExp(String.raw`^MUTASI CR\s*:\s*(${UANG})(?:\s+(\d+))?`, "i"));
      if (m) {
        totalCredit = toNumber(m[1]);
        totalCreditCount = m[2] ? parseInt(m[2], 10) : null;
        continue;
      }
      m = line.match(new RegExp(String.raw`^MUTASI DB\s*:\s*(${UANG})(?:\s+(\d+))?`, "i"));
      if (m) {
        totalDebit = toNumber(m[1]);
        totalDebitCount = m[2] ? parseInt(m[2], 10) : null;
        continue;
      }

      if (!inTable) continue;

      // ── Baris di dalam tabel ──
      const awal = line.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);

      if (!awal) {
        // Tidak diawali tanggal → baris lanjutan keterangan transaksi sebelumnya.
        if (current && line.trim()) {
          current.description = `${current.description} ${line.trim()}`.trim();
          current.description_normalized = normalize(current.description);
        }
        continue;
      }

      const tanggal = awal[1];
      const sisa = awal[2].trim();

      // "01/07 SALDO AWAL 136,814,472.14" — baris saldo awal, bukan transaksi.
      const saldoAwal = sisa.match(new RegExp(String.raw`^SALDO AWAL\s+(${UANG})`, "i"));
      if (saldoAwal) {
        if (openingBalance === null) openingBalance = toNumber(saldoAwal[1]);
        current = null;
        continue;
      }

      const tx = parseBarisTransaksi(tanggal, sisa, periodFrom);
      if (tx) {
        transactions.push(tx);
        current = tx;
      } else {
        current = null;
      }
    }

    if (!accountNumber) throw new Error("Nomor rekening tidak ditemukan di PDF");
    if (!periodFrom || !periodTo) throw new Error("Periode tidak ditemukan di PDF");
    if (transactions.length === 0) throw new Error("Tidak ada transaksi terdeteksi di PDF");

    return {
      parser_name: "bca-giro-pdf",
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

/**
 * Ubah CSV hasil pdf-extract jadi daftar baris datar.
 *
 * Sel digabung dengan spasi, bukan dipetakan per indeks kolom, karena
 * pemisahan kolom di pdf-extract berbasis jarak horizontal dan jumlah selnya
 * tidak konsisten antar baris. Mencocokkan pola di string yang sudah datar
 * jauh lebih tahan banting daripada mengandalkan posisi indeks.
 */
function flatten(content: string): string[] {
  const parsed = Papa.parse<string[]>(content, { skipEmptyLines: "greedy" });
  return parsed.data
    .map((row) => row.map((c) => (c ?? "").trim()).filter(Boolean).join(" ").trim())
    .filter((l) => l.length > 0);
}

/**
 * Parse satu baris transaksi.
 *
 * Bentuk ekornya: <keterangan> <mutasi> [DB] [saldo]
 *   "TRSF E-BANKING CR 0107/FTSCY/WS95031 1,129,000.00 137,943,472.14"
 *   "BIAYA ADM 0998 30,000.00 DB 137,913,472.14"
 *   "TRSF E-BANKING DB 1007/FTSCY/WS95051 1,053,743.00 DB"
 *   "BUNGA 55,083.88"
 *
 * Prefiks keterangan sengaja lazy supaya angka pertama yang cocok dianggap
 * mutasi dan sisanya saldo — bukan sebaliknya.
 *
 * Penanda "DB" hanya muncul untuk debit. Tanpa penanda berarti kredit. Karena
 * itu pencocokan dilakukan dari ujung kanan baris, sebab keterangan sendiri
 * sering mengandung kata "DB" (mis. "TRSF E-BANKING DB").
 */
function parseBarisTransaksi(
  tanggal: string,
  sisa: string,
  periodFrom: string | null
): ParsedTransaction | null {
  const m = sisa.match(
    new RegExp(String.raw`^(.*?)\s+(${UANG})(?:\s+(DB))?(?:\s+(${UANG}))?\s*$`, "i")
  );
  if (!m) return null;

  const keterangan = (m[1] ?? "").trim();
  if (!keterangan) return null;

  const jumlah = toNumber(m[2]);
  if (!isFinite(jumlah)) return null;

  const isDebit = !!m[3];
  const saldo = m[4] ? toNumber(m[4]) : null;

  const txDate = toISODate(tanggal, periodFrom);
  if (!txDate) return null;

  return {
    tx_date: txDate,
    tx_time: null,
    description: keterangan,
    description_normalized: normalize(keterangan),
    bank_branch_code: null,
    debit: isDebit ? jumlah : 0,
    credit: isDebit ? 0 : jumlah,
    balance: saldo,
    direction: isDebit ? "out" : "in",
  };
}

/** "01/07" → "2026-07-01", tahun diambil dari periode. */
function toISODate(ddmm: string, periodFrom: string | null): string | null {
  const m = ddmm.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!dd || !mm) return null;

  let year: number;
  if (periodFrom) {
    const [py, pm] = periodFrom.split("-").map((n) => parseInt(n, 10));
    year = py;
    // Periode melintasi pergantian tahun (Des → Jan)
    if (mm < pm) year++;
  } else {
    year = new Date().getFullYear();
  }

  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function toNumber(raw: string): number {
  return parseFloat((raw ?? "").replace(/,/g, ""));
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeCurrency(raw: string): string {
  const t = (raw ?? "").trim().toUpperCase();
  if (t === "RP" || t === "IDR") return "IDR";
  if (t === "USD" || t === "$") return "USD";
  if (t === "SGD" || t === "S$") return "SGD";
  if (t === "EUR") return "EUR";
  return t;
}
