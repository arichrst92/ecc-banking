-- Migration 0005: Tipe Dana (segments) + Sub Tipe Dana (sub_segments)
-- Hierarki baru: branches → segments → sub_segments → accounts
-- Plus: accounts.currency jadi NOT NULL (manual input, bukan auto-derive)

-- ── segments (UI: "Tipe Dana") ──
CREATE TABLE IF NOT EXISTS segments (
  id            BIGSERIAL PRIMARY KEY,
  branch_id     BIGINT      NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name          TEXT        NOT NULL,
  code          TEXT,
  status        TEXT        NOT NULL DEFAULT 'aktif'
                  CHECK (status IN ('aktif','nonaktif')),
  notes         TEXT,
  display_order INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, name)
);
CREATE INDEX IF NOT EXISTS idx_segments_branch ON segments(branch_id);
CREATE INDEX IF NOT EXISTS idx_segments_status ON segments(status);

-- ── sub_segments (UI: "Sub Tipe Dana") ──
CREATE TABLE IF NOT EXISTS sub_segments (
  id            BIGSERIAL PRIMARY KEY,
  segment_id    BIGINT      NOT NULL REFERENCES segments(id) ON DELETE RESTRICT,
  name          TEXT        NOT NULL,
  code          TEXT,
  status        TEXT        NOT NULL DEFAULT 'aktif'
                  CHECK (status IN ('aktif','nonaktif')),
  notes         TEXT,
  display_order INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (segment_id, name)
);
CREATE INDEX IF NOT EXISTS idx_sub_segments_segment ON sub_segments(segment_id);
CREATE INDEX IF NOT EXISTS idx_sub_segments_status ON sub_segments(status);

-- ── Triggers updated_at ──
DROP TRIGGER IF EXISTS trg_segments_updated     ON segments;
DROP TRIGGER IF EXISTS trg_sub_segments_updated ON sub_segments;
CREATE TRIGGER trg_segments_updated     BEFORE UPDATE ON segments     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sub_segments_updated BEFORE UPDATE ON sub_segments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Migrasi data existing ──
-- 1. Bikin default "Umum" segment per cabang
INSERT INTO segments (branch_id, name, code, status, display_order)
SELECT id, 'Umum', 'UMUM', 'aktif', 0 FROM branches
ON CONFLICT (branch_id, name) DO NOTHING;

-- 2. Bikin default "Umum" sub_segment per segment
INSERT INTO sub_segments (segment_id, name, code, status, display_order)
SELECT s.id, 'Umum', 'UMUM', 'aktif', 0
  FROM segments s WHERE s.name = 'Umum'
ON CONFLICT (segment_id, name) DO NOTHING;

-- ── Modify accounts: tambah sub_segment_id ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'sub_segment_id'
  ) THEN
    ALTER TABLE accounts ADD COLUMN sub_segment_id BIGINT REFERENCES sub_segments(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 3. Link existing accounts ke sub_segment "Umum" sesuai branch
UPDATE accounts a
SET sub_segment_id = (
  SELECT ss.id FROM sub_segments ss
  JOIN segments s ON s.id = ss.segment_id
  WHERE s.branch_id = a.branch_id
    AND s.name = 'Umum'
    AND ss.name = 'Umum'
  LIMIT 1
)
WHERE a.sub_segment_id IS NULL;

-- 4. Set NOT NULL
ALTER TABLE accounts ALTER COLUMN sub_segment_id SET NOT NULL;

-- 5. Index baru
CREATE INDEX IF NOT EXISTS idx_accounts_sub_segment ON accounts(sub_segment_id);

-- ── Currency: jadi NOT NULL dengan default IDR ──
UPDATE accounts SET currency = 'IDR' WHERE currency IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'currency' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE accounts ALTER COLUMN currency SET NOT NULL;
    ALTER TABLE accounts ALTER COLUMN currency SET DEFAULT 'IDR';
  END IF;
END $$;
