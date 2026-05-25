-- Migration 0009: Backfill default "Umum" segment + sub_segment untuk cabang yang
-- belum punya. Untuk cabang yang dibuat manual via UI sebelum auto-create di-fix.

-- Bikin segment "Umum" untuk cabang yang belum punya segment apa pun
INSERT INTO segments (branch_id, name, code, status, display_order)
SELECT b.id, 'Umum', 'UMUM', 'aktif', 0
  FROM branches b
 WHERE NOT EXISTS (SELECT 1 FROM segments s WHERE s.branch_id = b.id)
ON CONFLICT (branch_id, name) DO NOTHING;

-- Bikin sub_segment "Umum" untuk segment yang belum punya sub_segment apa pun
INSERT INTO sub_segments (segment_id, name, code, status, display_order)
SELECT s.id, 'Umum', 'UMUM', 'aktif', 0
  FROM segments s
 WHERE NOT EXISTS (SELECT 1 FROM sub_segments ss WHERE ss.segment_id = s.id)
ON CONFLICT (segment_id, name) DO NOTHING;
