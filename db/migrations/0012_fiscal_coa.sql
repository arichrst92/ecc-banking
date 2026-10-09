-- Migration 0012: Fiscal / Chart of Accounts
--  1. category_groups  → grouping kategori (Revenue Accounts, Expenses, dst)
--  2. categories.account_code + group_id → kode akun (4001, 5001, ...) + grup
--  3. fiscal_budgets   → anggaran bulanan per cabang/kategori/tahun
--  4. Seed Chart of Accounts sesuai contoh ECC + assign existing categories

-- ─────────────────────────────────────────────────────────────
-- 1. category_groups
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS category_groups (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT        NOT NULL UNIQUE,
  -- kind menentukan sisi laporan + nilai yang diambil dari transaksi:
  --   revenue → ambil SUM(credit)  (pemasukan)
  --   expense → ambil SUM(debit)   (pengeluaran)
  --   other   → net (credit - debit)
  kind          TEXT        NOT NULL DEFAULT 'other'
                  CHECK (kind IN ('revenue','expense','other')),
  display_order INT         NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_category_groups_updated ON category_groups;
CREATE TRIGGER trg_category_groups_updated BEFORE UPDATE ON category_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO category_groups (name, kind, display_order) VALUES
  ('Revenue Accounts', 'revenue', 10),
  ('Expenses',         'expense', 20)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. categories: tambah account_code + group_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE categories ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_id BIGINT
  REFERENCES category_groups(id) ON DELETE SET NULL;

-- account_code unik (NULL boleh banyak — kategori tanpa kode)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_categories_account_code
  ON categories(account_code) WHERE account_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_group ON categories(group_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Seed Chart of Accounts (sesuai contoh ECC 2026)
--    name harus unik → duplikat "Offering- Persembahan" dibedakan.
-- ─────────────────────────────────────────────────────────────
INSERT INTO categories (name, type, keywords, color, priority, is_system, account_code, group_id)
SELECT v.name, v.type, v.keywords, v.color, v.priority, false, v.account_code,
       (SELECT id FROM category_groups WHERE name = v.group_name)
FROM (VALUES
  -- Revenue Accounts (4xxx)
  ('Offering - Persembahan',            'masuk',  ARRAY['OFFERING','PERSEMBAHAN'],              '#2e7d6e', 10, '4001', 'Revenue Accounts'),
  ('Offering - Persembahan II',         'masuk',  ARRAY[]::TEXT[],                              '#2e7d6e', 11, '4002', 'Revenue Accounts'),
  ('Tithe - Persepuluhan',              'masuk',  ARRAY['TITHE','PERSEPULUHAN','PERPULUHAN'],   '#16a085', 12, '4003', 'Revenue Accounts'),
  ('Special Offering / Pledge - Janji Iman', 'masuk', ARRAY['PLEDGE','JANJI IMAN','SPECIAL OFFERING'], '#1abc9c', 13, '4004', 'Revenue Accounts'),
  ('Offering Ckids, Bridge, Teens',     'masuk',  ARRAY['CKIDS','BRIDGE','TEENS'],              '#27ae60', 14, '4005', 'Revenue Accounts'),
  ('Others Revenue',                    'masuk',  ARRAY[]::TEXT[],                              '#52b788', 15, '4006', 'Revenue Accounts'),
  ('Bank Interest',                     'masuk',  ARRAY['INTEREST','BUNGA','JASA GIRO'],        '#74c69d', 16, '4007', 'Revenue Accounts'),
  -- Expenses (5xxx)
  ('Bank Expense',                      'keluar', ARRAY['ADMIN','BIAYA ADM','BANK CHARGE','ADM'], '#c0392b', 20, '5001', 'Expenses'),
  ('Miscellaneous Expense',             'keluar', ARRAY['MISC','LAIN-LAIN'],                    '#e74c3c', 21, '5002', 'Expenses'),
  ('Consumption Expense',               'keluar', ARRAY['KONSUMSI','CONSUMPTION'],              '#d35400', 22, '5003', 'Expenses'),
  ('Hospitality Expense (Hosting)',     'keluar', ARRAY['HOSPITALITY','HOSTING'],              '#e67e22', 23, '5004', 'Expenses'),
  ('Rent Expense',                      'keluar', ARRAY['RENT','SEWA'],                         '#f39c12', 24, '5005', 'Expenses'),
  ('Utilities Expense',                 'keluar', ARRAY['PLN','PDAM','TELKOM','LISTRIK','AIR','UTILITIES'], '#e85d10', 25, '5006', 'Expenses'),
  ('Allowance Expense',                 'keluar', ARRAY['ALLOWANCE','TUNJANGAN'],              '#d4700e', 26, '5007', 'Expenses'),
  ('Building & Installment Expense',    'keluar', ARRAY['BUILDING','INSTALLMENT','CICILAN','PEMBANGUNAN'], '#8e44ad', 27, '5008', 'Expenses'),
  ('Service Expense',                   'keluar', ARRAY['SERVICE','SERVIS'],                    '#9b59b6', 28, '5009', 'Expenses'),
  ('Ckids Expense',                     'keluar', ARRAY['CKIDS EXPENSE'],                       '#a569bd', 29, '5010', 'Expenses'),
  ('BCC Expense',                       'keluar', ARRAY['BCC'],                                 '#7d3c98', 30, '5011', 'Expenses'),
  ('Human Resources Expense',           'keluar', ARRAY['GAJI','SALARY','HR','HUMAN RESOURCES','HONOR'], '#2980b9', 31, '5012', 'Expenses'),
  ('Centralization ECC Global',         'keluar', ARRAY['CENTRALIZATION','ECC GLOBAL'],         '#2471a3', 32, '5013', 'Expenses'),
  ('Saving',                            'keluar', ARRAY['SAVING','TABUNGAN'],                   '#566573', 33, '5014', 'Expenses')
) AS v(name, type, keywords, color, priority, account_code, group_name)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. Backfill grup untuk kategori lama (yang belum punya grup)
--    supaya transaksi existing tetap muncul di laporan.
-- ─────────────────────────────────────────────────────────────
UPDATE categories
   SET group_id = (SELECT id FROM category_groups WHERE name = 'Revenue Accounts')
 WHERE group_id IS NULL AND type = 'masuk';

UPDATE categories
   SET group_id = (SELECT id FROM category_groups WHERE name = 'Expenses')
 WHERE group_id IS NULL AND type IN ('keluar','keduanya') AND is_system = false;

-- ─────────────────────────────────────────────────────────────
-- 5. fiscal_budgets — anggaran bulanan per cabang/kategori/tahun
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_budgets (
  id            BIGSERIAL PRIMARY KEY,
  branch_id     BIGINT        NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
  category_id   BIGINT        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  fiscal_year   INT           NOT NULL,
  month         SMALLINT      NOT NULL CHECK (month BETWEEN 1 AND 12),
  currency      CHAR(3)       NOT NULL DEFAULT 'IDR',
  amount        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, category_id, fiscal_year, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_lookup
  ON fiscal_budgets(fiscal_year, branch_id, category_id);

DROP TRIGGER IF EXISTS trg_fiscal_budgets_updated ON fiscal_budgets;
CREATE TRIGGER trg_fiscal_budgets_updated BEFORE UPDATE ON fiscal_budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
