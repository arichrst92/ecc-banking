-- Migration 0011: currency_rates untuk fitur "View in USD"
-- Konversi display-only, tidak ubah data transaksi di DB.

CREATE TABLE IF NOT EXISTS currency_rates (
  id            BIGSERIAL PRIMARY KEY,
  from_currency CHAR(3)         NOT NULL,
  to_currency   CHAR(3)         NOT NULL,
  rate          NUMERIC(18, 8)  NOT NULL,  -- 1 from_currency = X to_currency
  source        TEXT            NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'api', 'seed')),
  notes         TEXT,
  effective_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CHECK (from_currency <> to_currency),
  CHECK (rate > 0)
);

CREATE INDEX IF NOT EXISTS idx_rates_pair_effective
  ON currency_rates(from_currency, to_currency, effective_at DESC);

DROP TRIGGER IF EXISTS trg_currency_rates_updated ON currency_rates;
CREATE TRIGGER trg_currency_rates_updated
  BEFORE UPDATE ON currency_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed kurs awal (per Mei 2026, approximate)
-- 1 unit dari currency X = rate USD
INSERT INTO currency_rates (from_currency, to_currency, rate, source, notes) VALUES
  ('IDR', 'USD', 0.00006150, 'seed', 'Approx 1 USD = 16,260 IDR'),
  ('MYR', 'USD', 0.21000000, 'seed', 'Approx 1 USD = 4.76 MYR'),
  ('SGD', 'USD', 0.74000000, 'seed', 'Approx 1 USD = 1.35 SGD'),
  ('EUR', 'USD', 1.05000000, 'seed', 'Approx 1 USD = 0.95 EUR'),
  ('GBP', 'USD', 1.25000000, 'seed', 'Approx 1 USD = 0.80 GBP'),
  ('JPY', 'USD', 0.00640000, 'seed', 'Approx 1 USD = 156 JPY'),
  ('AUD', 'USD', 0.65000000, 'seed', 'Approx 1 USD = 1.54 AUD'),
  ('USD', 'IDR', 16260.0,    'seed', 'Reverse for completeness'),
  ('USD', 'MYR', 4.76,       'seed', 'Reverse'),
  ('USD', 'SGD', 1.35,       'seed', 'Reverse'),
  ('USD', 'EUR', 0.95,       'seed', 'Reverse'),
  ('USD', 'USD', 1.00,       'seed', 'Identity')
ON CONFLICT DO NOTHING;
