-- Migration 0007: cache hasil AI categorization di uploads row
-- Supaya tidak perlu call LLM lagi saat confirm (preview sudah generate).
--
-- Format:
--   {
--     "method": "ai" | "keyword",
--     "model": "claude-haiku-4-5-...",
--     "computed_at": "2026-05-13T12:34:56Z",
--     "input_tokens": 1234,
--     "output_tokens": 567,
--     "cost_usd": 0.012,
--     "classifications": {
--       "<dup_hash>": {
--         "category_id": 5,
--         "category_name": "Operasional",
--         "confidence": 0.9,
--         "reason": "Match keyword PLN"
--       }
--     }
--   }

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'categorization_cache'
  ) THEN
    ALTER TABLE uploads ADD COLUMN categorization_cache JSONB;
  END IF;
END $$;

-- Track AI categorization cost separately untuk reporting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'ai_categorization_cost_usd'
  ) THEN
    ALTER TABLE uploads ADD COLUMN ai_categorization_cost_usd NUMERIC(10,4);
  END IF;
END $$;
