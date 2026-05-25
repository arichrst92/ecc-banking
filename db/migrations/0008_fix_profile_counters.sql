-- Migration 0008: Fix counter format_profiles.upload_count yang ter-triple count
-- karena re-parse di preview + confirm masing-masing increment.
--
-- Recalculate berdasarkan actual count uploads yang reference profile.

UPDATE format_profiles fp
SET upload_count = COALESCE(uc.cnt, 0),
    success_count = COALESCE(uc.success_cnt, 0),
    fail_count = COALESCE(uc.fail_cnt, 0)
FROM (
  SELECT format_profile_id,
         COUNT(*)::INT AS cnt,
         COUNT(*) FILTER (WHERE status = 'success')::INT AS success_cnt,
         COUNT(*) FILTER (WHERE status = 'failed')::INT AS fail_cnt
    FROM uploads
   WHERE format_profile_id IS NOT NULL
   GROUP BY format_profile_id
) uc
WHERE fp.id = uc.format_profile_id;

-- Untuk profile yang belum pernah dipakai upload, set ke 0
UPDATE format_profiles
   SET upload_count = 0, success_count = 0, fail_count = 0
 WHERE id NOT IN (SELECT DISTINCT format_profile_id FROM uploads WHERE format_profile_id IS NOT NULL);
