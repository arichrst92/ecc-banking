// Exchange rate untuk display-only USD conversion.
// Rate = berapa unit currency per 1 USD.
//
// Update manual untuk MVP. Ke depan bisa di-pull dari API (exchangerate.host)
// atau admin set via UI.

export const USD_RATES: Record<string, number> = {
  // 1 USD = N currency
  IDR: 15800,
  MYR: 4.70,
  SGD: 1.35,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.52,
  JPY: 152,
  USD: 1, // identity
};

/**
 * Convert amount dari currency native ke USD.
 * Return null kalau currency tidak ada di rate table.
 */
export function convertToUSD(amount: number, fromCurrency: string): number | null {
  const code = fromCurrency.toUpperCase();
  const rate = USD_RATES[code];
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
