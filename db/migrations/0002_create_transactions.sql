-- Migration 0002: uploads + transactions

CREATE TABLE IF NOT EXISTS uploads (
  id                     BIGSERIAL PRIMARY KEY,
  account_id             BIGINT       NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  branch_id              BIGINT       NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  filename               TEXT         NOT NULL,
  mime_type              TEXT         NOT NULL,
  file_size_bytes        BIGINT       NOT NULL,
  storage_path           TEXT,
  parser_name            TEXT         NOT NULL,
  date_from              DATE         NOT NULL,
  date_to                DATE         NOT NULL,
  currency               CHAR(3)      NOT NULL,
  opening_balance        NUMERIC(18,2),
  closing_balance        NUMERIC(18,2),
  total_debit_period     NUMERIC(18,2),
  total_credit_period    NUMERIC(18,2),
  total_debit_count      INT,
  total_credit_count     INT,
  balance_check_passed   BOOLEAN,
  tx_count               INT          NOT NULL DEFAULT 0,
  tx_inserted            INT          NOT NULL DEFAULT 0,
  tx_duplicates          INT          NOT NULL DEFAULT 0,
  status                 TEXT         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','success','failed')),
  error_message          TEXT,
  uploaded_by_role       TEXT         NOT NULL,
  uploaded_by_branch_id  BIGINT       REFERENCES branches(id) ON DELETE SET NULL,
  uploaded_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_uploads_account     ON uploads(account_id);
CREATE INDEX IF NOT EXISTS idx_uploads_branch      ON uploads(branch_id);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id                       BIGSERIAL PRIMARY KEY,
  account_id               BIGINT        NOT NULL REFERENCES accounts(id)   ON DELETE RESTRICT,
  branch_id                BIGINT        NOT NULL REFERENCES branches(id)   ON DELETE RESTRICT,
  upload_id                BIGINT        NOT NULL REFERENCES uploads(id)    ON DELETE RESTRICT,
  category_id              BIGINT        NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  currency                 CHAR(3)       NOT NULL,
  tx_date                  DATE          NOT NULL,
  tx_time                  TIME,
  description              TEXT          NOT NULL,
  description_normalized   TEXT          NOT NULL,
  bank_branch_code         TEXT,
  debit                    NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit                   NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance                  NUMERIC(18,2),
  direction                TEXT          NOT NULL CHECK (direction IN ('in','out')),
  note                     TEXT,
  is_anomaly               BOOLEAN       NOT NULL DEFAULT false,
  anomaly_reasons          TEXT[]        NOT NULL DEFAULT '{}',
  dup_hash                 TEXT          NOT NULL UNIQUE,
  archived_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit = 0 AND credit > 0) OR (debit > 0 AND credit = 0))
);
CREATE INDEX IF NOT EXISTS idx_tx_account_date_active ON transactions(account_id, tx_date DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tx_branch_date_active  ON transactions(branch_id, tx_date DESC)  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tx_category            ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_upload              ON transactions(upload_id);
CREATE INDEX IF NOT EXISTS idx_tx_currency            ON transactions(currency);
CREATE INDEX IF NOT EXISTS idx_tx_archived            ON transactions(archived_at);

DROP TRIGGER IF EXISTS trg_tx_updated ON transactions;
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
