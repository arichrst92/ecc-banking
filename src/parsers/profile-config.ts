// Schema deklaratif untuk parser engine.
// FormatProfileConfig disimpan di kolom `format_profiles.config` (JSONB).
// LLM generate ini untuk format baru via tool use.

export type DateFormat =
  | "DD/MM/YYYY"
  | "DD-MM-YYYY"
  | "YYYY-MM-DD"
  | "DD/MM"      // tahun di-derive dari periode
  | "MM/DD/YYYY";

export type TimeFormat =
  | "HH:MM:SS"
  | "HH:MM:SS_AM_PM" // "09:55:31 AM"
  | "HH:MM";

export type CurrencyNormalize = { from: string; to: string };

export interface FormatProfileConfig {
  // ── Struktur file ──
  // "key_value_header"  → BCA, Mandiri (ada baris key:value sebelum tabel)
  // "marker_based"      → HSBC (setiap baris diawali marker H1/H2/D1/D2/T)
  // "pure_table"        → file tanpa header, langsung tabel
  structure: "key_value_header" | "marker_based" | "pure_table";

  // ── Marker config (untuk structure="marker_based") ──
  markers?: {
    marker_column: number;        // index kolom yang berisi marker (biasanya 0)
    header_data: string;          // "H2"  — baris berisi info akun
    table_row: string;            // "D2"  — baris berisi transaksi
    table_header?: string;        // "D1"  — header definisi kolom (optional, untuk detect)
    footer_summary?: string;      // "T"   — baris total (optional)
  };

  // ── Detect awal tabel (untuk structure="key_value_header") ──
  table_start?: {
    detect: string[];             // exact match cells, mis. ["Tanggal Transaksi","Keterangan","Cabang","Jumlah","Saldo"]
    skip_until_after: boolean;    // mulai parse setelah baris ini
  };

  // ── Extract account_number ──
  account_number:
    | { mode: "regex_line"; pattern: string; group?: number }     // pattern dijalankan ke semua row[0]
    | { mode: "marker_column"; column: number };                  // ambil dari column di header_data row

  // ── Extract currency ──
  currency:
    | { mode: "regex_line"; pattern: string; group?: number; normalize?: CurrencyNormalize[] }
    | { mode: "marker_column"; column: number; normalize?: CurrencyNormalize[] }
    | { mode: "fixed"; value: string };

  // ── Extract periode (date_from, date_to) ──
  period:
    | { mode: "regex_line"; pattern: string; from_group: number; to_group: number; date_format: DateFormat }
    | { mode: "marker_columns"; from_column: number; to_column: number; date_format: DateFormat };

  // ── Number format ──
  number: {
    thousand_separator: "," | "." | "";
    decimal_separator: "." | ",";
  };

  // ── Date format dalam row transaksi ──
  tx_date_format: DateFormat;

  // ── Time format (optional, kalau ada) ──
  tx_time_format?: TimeFormat;

  // ── Column mapping untuk row transaksi ──
  // Untuk marker_based, marker_column tidak dihitung (index 0 = setelah marker).
  // Untuk key_value_header, index 0 = column pertama di baris setelah table_start.
  columns: {
    tx_date: { index: number };
    tx_time?: { index: number };
    description: { index: number; extra_indices?: number[] };  // gabung jadi 1 string
    bank_branch_code?: { index: number };

    // Variant A: amount tunggal dengan suffix DB/CR
    amount_with_suffix?: {
      index: number;
      // Regex extract: group 1 = number, group 2 = direction marker
      // Default: /^([\d,]+\.?\d*)\s*(DB|CR)$/i
      direction_marker_debit?: string;   // "DB"
      direction_marker_credit?: string;  // "CR"
    };

    // Variant B: kolom debit + kredit terpisah
    debit?: { index: number };
    credit?: { index: number };

    balance?: { index: number };
  };

  // ── Footer extraction (optional) ──
  footer?: {
    // Mode regex_lines: scan baris berisi pattern
    opening_balance?: { pattern: string; group?: number };
    closing_balance?: { pattern: string; group?: number };
    total_debit?: { pattern: string; group?: number; count_pattern?: string };
    total_credit?: { pattern: string; group?: number; count_pattern?: string };

    // ATAU mode marker_columns: ambil dari baris dengan marker tertentu
    summary_marker?: string;          // "T"
    summary_debit_column?: number;    // index kolom total debit di baris T
    summary_credit_column?: number;
    summary_label_check?: { column: number; contains: string }; // verify "Total in Account Currency"
  };
}
