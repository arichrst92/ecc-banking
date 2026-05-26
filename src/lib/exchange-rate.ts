// Exchange rate dari DB tabel `exchange_rates`.
// Rate format: 1 USD = N currency (mis. IDR rate = 15800 berarti 1 USD = 15,800 IDR).

import { query } from "./db";

export type RateMap = Record<string, number>;

/**
 * Fetch semua rate dari DB. Return map currency_code → rate_to_usd.
 * Caller bisa cache per request.
 */
export async function getRates(): Promise<RateMap> {
  const rows = await query<{ currency_code: string; rate_to_usd: string }>(
    `SELECT currency_code, rate_to_usd::TEXT FROM exchange_rates`
  );
  const map: RateMap = {};
  for (const r of rows) {
    map[r.currency_code.toUpperCase()] = parseFloat(r.rate_to_usd);
  }
  // Pastikan USD selalu ada (defensive)
  if (!map.USD) map.USD = 1;
  return map;
}

/**
 * Convert amount dari currency native ke USD pakai rates map.
 * Return null kalau currency tidak ada di rate table.
 */
export function convertToUSD(amount: number, fromCurrency: string, rates: RateMap): number | null {
  const code = fromCurrency.toUpperCase();
  const rate = rates[code];
  if (rate === undefined) return null;
  return amount / rate;
}

/**
 * Helper: parse string atau number jadi number aman.
 */
export function toNumber(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return isNaN(n) ? 0 : n;
}
