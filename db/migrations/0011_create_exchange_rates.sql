-- Migration 0011: Tabel exchange_rates untuk View in USD conversion.
-- Rate disimpan sebagai: 1 USD = rate_to_usd × currency_code
-- Mis. IDR rate_to_usd = 15800 artinya 1 USD = 15,800 IDR

CREATE TABLE IF NOT EXISTS exchange_rates (
  id              BIGSERIAL PRIMARY KEY,
  currency_code   CHAR(3)         NOT NULL UNIQUE,
  rate_to_usd     NUMERIC(18, 6)  NOT NULL CHECK (rate_to_usd > 0),
  notes           TEXT,
  updated_by_role TEXT,
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_exchange_rates_updated ON exchange_rates;
CREATE TRIGGER trg_exchange_rates_updated BEFORE UPDATE ON exchange_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default rates
INSERT INTO exchange_rates (currency_code, rate_to_usd, notes) VALUES
  ('USD', 1,         'Identity — base currency'),
  ('IDR', 15800,     'Rupiah Indonesia'),
  ('MYR', 4.70,      'Ringgit Malaysia'),
  ('SGD', 1.35,      'Dollar Singapura'),
  ('EUR', 0.92,      'Euro'),
  ('GBP', 0.79,      'Pound Sterling'),
  ('AUD', 1.52,      'Dollar Australia'),
  ('JPY', 152,       'Yen Jepang')
ON CONFLICT (currency_code) DO NOTHING;
