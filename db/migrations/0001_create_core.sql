-- Migration 0001: Core tables (branches, accounts, categories, auth_codes)

CREATE TABLE IF NOT EXISTS branches (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  code         TEXT        NOT NULL UNIQUE,
  pic_name     TEXT        NOT NULL,
  pic_phone    TEXT,
  status       TEXT        NOT NULL DEFAULT 'aktif'
                CHECK (status IN ('aktif','nonaktif','review')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status);

CREATE TABLE IF NOT EXISTS accounts (
  id              BIGSERIAL PRIMARY KEY,
  branch_id       BIGINT       NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  bank            TEXT         NOT NULL,
  account_number  TEXT         NOT NULL,
  account_holder  TEXT         NOT NULL,
  purpose         TEXT         NOT NULL,
  currency        CHAR(3),
  status          TEXT         NOT NULL DEFAULT 'aktif'
                    CHECK (status IN ('aktif','nonaktif')),
  current_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (bank, account_number)
);
CREATE INDEX IF NOT EXISTS idx_accounts_branch   ON accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status   ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);

CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  type        TEXT        NOT NULL CHECK (type IN ('masuk','keluar','keduanya')),
  keywords    TEXT[]      NOT NULL DEFAULT '{}',
  color       TEXT        NOT NULL DEFAULT '#8a94a6',
  priority    INT         NOT NULL DEFAULT 100,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_priority ON categories(priority);

CREATE TABLE IF NOT EXISTS auth_codes (
  id            BIGSERIAL PRIMARY KEY,
  scope         TEXT        NOT NULL CHECK (scope IN ('global','branch')),
  branch_id     BIGINT      REFERENCES branches(id) ON DELETE CASCADE,
  code_hash     TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope = 'global' AND branch_id IS NULL)
      OR (scope = 'branch' AND branch_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_auth_global_active
  ON auth_codes (scope) WHERE scope = 'global' AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_auth_branch_active
  ON auth_codes (branch_id) WHERE scope = 'branch' AND is_active = true;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branches_updated   ON branches;
DROP TRIGGER IF EXISTS trg_accounts_updated   ON accounts;
DROP TRIGGER IF EXISTS trg_categories_updated ON categories;
DROP TRIGGER IF EXISTS trg_auth_codes_updated ON auth_codes;

CREATE TRIGGER trg_branches_updated   BEFORE UPDATE ON branches    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_accounts_updated   BEFORE UPDATE ON accounts    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_auth_codes_updated BEFORE UPDATE ON auth_codes  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
