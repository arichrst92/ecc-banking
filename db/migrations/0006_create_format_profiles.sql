-- Migration 0006: format_profiles untuk schema-based parser
-- LLM-generated parser config disimpan di sini, di-reuse untuk upload berikutnya.

CREATE TABLE IF NOT EXISTS format_profiles (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT        NOT NULL UNIQUE,
  bank_hint       TEXT,                          -- "BCA", "HSBC Malaysia", dll (untuk display)
  detect_patterns TEXT[]      NOT NULL,          -- regex[] di-AND match dalam ~2KB pertama file
  config          JSONB       NOT NULL,          -- FormatProfileConfig (lihat parsers/profile-config.ts)
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','disabled','pending_review')),
  created_by      TEXT        NOT NULL CHECK (created_by IN ('manual','llm','seed')),
  created_by_role TEXT,                          -- 'global' / 'branch' yang trigger LLM bootstrap
  upload_count    INT         NOT NULL DEFAULT 0,
  success_count   INT         NOT NULL DEFAULT 0,
  fail_count      INT         NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  notes           TEXT,
  llm_model       TEXT,                          -- "claude-haiku-4-5-..." kalau dari LLM
  llm_input_tokens  INT,
  llm_output_tokens INT,
  llm_cost_usd      NUMERIC(10,4),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_format_profiles_status ON format_profiles(status);
CREATE INDEX IF NOT EXISTS idx_format_profiles_last_used ON format_profiles(last_used_at DESC);

DROP TRIGGER IF EXISTS trg_format_profiles_updated ON format_profiles;
CREATE TRIGGER trg_format_profiles_updated BEFORE UPDATE ON format_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tambah kolom uploads.format_profile_id untuk track parser mana yang dipakai
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'format_profile_id'
  ) THEN
    ALTER TABLE uploads ADD COLUMN format_profile_id BIGINT REFERENCES format_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_uploads_format_profile ON uploads(format_profile_id);

-- ── Seed: BCA Corporate CSV profile (equivalent dengan hardcoded adapter) ──
INSERT INTO format_profiles (name, bank_hint, detect_patterns, config, status, created_by, notes)
VALUES (
  'BCA Corporate CSV',
  'BCA Indonesia',
  ARRAY['Informasi Rekening', 'No\.\s*rekening\s*:'],
  $json$
  {
    "structure": "key_value_header",
    "table_start": {
      "detect": ["Tanggal Transaksi", "Keterangan", "Cabang", "Jumlah", "Saldo"],
      "skip_until_after": true
    },
    "account_number": {
      "mode": "regex_line",
      "pattern": "^No\\.\\s*rekening\\s*:\\s*(\\d+)",
      "group": 1
    },
    "currency": {
      "mode": "regex_line",
      "pattern": "^Kode Mata Uang\\s*:\\s*(\\S+)",
      "group": 1,
      "normalize": [{"from": "Rp", "to": "IDR"}]
    },
    "period": {
      "mode": "regex_line",
      "pattern": "^Periode\\s*:\\s*(\\d{2}/\\d{2}/\\d{4})\\s*-\\s*(\\d{2}/\\d{2}/\\d{4})",
      "from_group": 1,
      "to_group": 2,
      "date_format": "DD/MM/YYYY"
    },
    "number": {
      "thousand_separator": ",",
      "decimal_separator": "."
    },
    "tx_date_format": "DD/MM",
    "columns": {
      "tx_date": {"index": 0},
      "description": {"index": 1},
      "bank_branch_code": {"index": 2},
      "amount_with_suffix": {
        "index": 3,
        "direction_marker_debit": "DB",
        "direction_marker_credit": "CR"
      },
      "balance": {"index": 4}
    },
    "footer": {
      "opening_balance": {"pattern": "^Saldo Awal\\s*:\\s*([\\d,]+\\.?\\d*)", "group": 1},
      "closing_balance": {"pattern": "^Saldo Akhir\\s*:\\s*([\\d,]+\\.?\\d*)", "group": 1},
      "total_debit":  {"pattern": "^Mutasi Debet\\s*:\\s*([\\d,]+\\.?\\d*)", "group": 1, "count_pattern": "yes"},
      "total_credit": {"pattern": "^Mutasi Kredit\\s*:\\s*([\\d,]+\\.?\\d*)", "group": 1, "count_pattern": "yes"}
    }
  }
  $json$,
  'active',
  'seed',
  'BCA Corporate Internet Banking CSV format. Equivalent dengan hardcoded adapter src/parsers/bca-csv.ts. Hardcoded adapter dipanggil duluan di registry untuk speed.'
)
ON CONFLICT (name) DO NOTHING;
