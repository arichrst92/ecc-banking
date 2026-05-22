export type Status = "aktif" | "nonaktif" | "review";
export type CategoryType = "masuk" | "keluar" | "keduanya";
export type Direction = "in" | "out";
export type Scope = "global" | "branch";

export interface Branch {
  id: number; name: string; code: string; pic_name: string;
  pic_phone: string | null; status: Status; notes: string | null;
  created_at: string; updated_at: string;
}

export interface Segment {
  id: number; branch_id: number; name: string; code: string | null;
  status: "aktif" | "nonaktif"; notes: string | null;
  display_order: number;
  created_at: string; updated_at: string;
}

export interface SubSegment {
  id: number; segment_id: number; name: string; code: string | null;
  status: "aktif" | "nonaktif"; notes: string | null;
  display_order: number;
  created_at: string; updated_at: string;
}

export interface Account {
  id: number; branch_id: number; sub_segment_id: number;
  bank: string; account_number: string;
  account_holder: string; purpose: string; currency: string;
  status: "aktif" | "nonaktif"; current_balance: string;
  last_synced_at: string | null; created_at: string; updated_at: string;
}

export interface Category {
  id: number; name: string; type: CategoryType; keywords: string[];
  color: string; priority: number; is_system: boolean;
  created_at: string; updated_at: string;
}

export interface Upload {
  id: number; account_id: number; branch_id: number; filename: string;
  mime_type: string; file_size_bytes: number; storage_path: string | null;
  parser_name: string; date_from: string; date_to: string; currency: string;
  opening_balance: string | null; closing_balance: string | null;
  total_debit_period: string | null; total_credit_period: string | null;
  total_debit_count: number | null; total_credit_count: number | null;
  balance_check_passed: boolean | null;
  tx_count: number; tx_inserted: number; tx_duplicates: number;
  status: "pending" | "processing" | "success" | "failed";
  error_message: string | null; uploaded_by_role: string;
  uploaded_by_branch_id: number | null;
  uploaded_at: string; processed_at: string | null;
}

export interface FormatProfile {
  id: number;
  name: string;
  bank_hint: string | null;
  detect_patterns: string[];
  config: unknown; // FormatProfileConfig dari src/parsers/profile-config.ts
  status: "active" | "disabled" | "pending_review";
  created_by: "manual" | "llm" | "seed";
  created_by_role: string | null;
  upload_count: number;
  success_count: number;
  fail_count: number;
  last_used_at: string | null;
  notes: string | null;
  llm_model: string | null;
  llm_input_tokens: number | null;
  llm_output_tokens: number | null;
  llm_cost_usd: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number; account_id: number; branch_id: number; upload_id: number;
  category_id: number; currency: string; tx_date: string; tx_time: string | null;
  description: string; description_normalized: string;
  bank_branch_code: string | null;
  debit: string; credit: string; balance: string | null; direction: Direction;
  note: string | null; is_anomaly: boolean; anomaly_reasons: string[];
  dup_hash: string; archived_at: string | null;
  created_at: string; updated_at: string;
}
