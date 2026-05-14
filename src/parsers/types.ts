// Parser interface — semua adapter bank/format implement ini.

export interface ParsedTransaction {
  tx_date: string;             // YYYY-MM-DD
  tx_time: string | null;      // HH:MM:SS (NULL kalau bank tidak punya jam, mis. BCA)
  description: string;         // keterangan mentah dari file
  description_normalized: string; // UPPER + trimmed, untuk matching kategori + dedup
  bank_branch_code: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  direction: "in" | "out";
}

export interface ParseResult {
  parser_name: string;         // mis. "bca-csv"
  account_number: string;
  currency: string;            // ISO 4217 (IDR, USD, ...)
  date_from: string;           // YYYY-MM-DD
  date_to: string;             // YYYY-MM-DD
  opening_balance: number | null;
  closing_balance: number | null;
  total_debit_period: number | null;
  total_credit_period: number | null;
  total_debit_count: number | null;
  total_credit_count: number | null;
  transactions: ParsedTransaction[];
}

export interface ParseAdapter {
  name: string;
  detect(content: string, filename: string): boolean;
  parse(content: string): ParseResult;
}
