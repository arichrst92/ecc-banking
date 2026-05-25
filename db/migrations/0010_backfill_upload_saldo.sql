-- Migration 0010: Backfill opening_balance / closing_balance untuk upload existing
-- yang belum punya nilai di footer file (mis. HSBC tidak punya saldo eksplisit).
--
-- Logic:
--   opening_balance = balance setelah tx pertama − credit + debit (balance sebelum tx itu)
--   closing_balance = balance tx terakhir kronologis yang punya balance
--   total_debit  = SUM(debit) dari transactions yg link ke upload ini
--   total_credit = SUM(credit) dari transactions yg link ke upload ini
--   counts juga di-derive

-- Backfill opening_balance kalau NULL
UPDATE uploads u
SET opening_balance = (
  SELECT t.balance - t.credit + t.debit
    FROM transactions t
   WHERE t.upload_id = u.id AND t.balance IS NOT NULL
   ORDER BY t.tx_date ASC, t.id ASC
   LIMIT 1
)
WHERE u.opening_balance IS NULL
  AND u.status = 'success'
  AND EXISTS (
    SELECT 1 FROM transactions t
     WHERE t.upload_id = u.id AND t.balance IS NOT NULL
  );

-- Backfill closing_balance kalau NULL
UPDATE uploads u
SET closing_balance = (
  SELECT t.balance
    FROM transactions t
   WHERE t.upload_id = u.id AND t.balance IS NOT NULL
   ORDER BY t.tx_date DESC, t.id DESC
   LIMIT 1
)
WHERE u.closing_balance IS NULL
  AND u.status = 'success'
  AND EXISTS (
    SELECT 1 FROM transactions t
     WHERE t.upload_id = u.id AND t.balance IS NOT NULL
  );

-- Backfill total_debit_period kalau NULL
UPDATE uploads u
SET total_debit_period = (
  SELECT COALESCE(SUM(t.debit), 0)
    FROM transactions t
   WHERE t.upload_id = u.id
)
WHERE u.total_debit_period IS NULL
  AND u.status = 'success';

-- Backfill total_credit_period kalau NULL
UPDATE uploads u
SET total_credit_period = (
  SELECT COALESCE(SUM(t.credit), 0)
    FROM transactions t
   WHERE t.upload_id = u.id
)
WHERE u.total_credit_period IS NULL
  AND u.status = 'success';

-- Backfill total_debit_count kalau NULL
UPDATE uploads u
SET total_debit_count = (
  SELECT COUNT(*)::INT FROM transactions t
   WHERE t.upload_id = u.id AND t.debit > 0
)
WHERE u.total_debit_count IS NULL
  AND u.status = 'success';

-- Backfill total_credit_count kalau NULL
UPDATE uploads u
SET total_credit_count = (
  SELECT COUNT(*)::INT FROM transactions t
   WHERE t.upload_id = u.id AND t.credit > 0
)
WHERE u.total_credit_count IS NULL
  AND u.status = 'success';

-- Recompute balance_check_passed setelah backfill
UPDATE uploads u
SET balance_check_passed = (
  ABS((u.opening_balance + u.total_credit_period - u.total_debit_period) - u.closing_balance) <= 1
)
WHERE u.balance_check_passed IS NULL
  AND u.opening_balance IS NOT NULL
  AND u.closing_balance IS NOT NULL
  AND u.total_debit_period IS NOT NULL
  AND u.total_credit_period IS NOT NULL;
