// View mode state: native (default) atau usd.
// Cookie `ecc_view_mode`. Rates di-load dari DB tabel exchange_rates.

import { cookies } from "next/headers";
import { formatMoney } from "./format";
import { convertToUSD, getRates, toNumber } from "./exchange-rate";

export type ViewMode = "native" | "usd";

const COOKIE_NAME = "ecc_view_mode";

export function getViewMode(): ViewMode {
  try {
    const v = cookies().get(COOKIE_NAME)?.value;
    return v === "usd" ? "usd" : "native";
  } catch {
    return "native";
  }
}

/**
 * Return formatter function untuk display amount.
 * - Native mode: format pakai currency asli (sync via formatMoney).
 * - USD mode: load rates dari DB → convert → format USD + asterisk.
 *
 * Async karena baca rates dari DB. Pages await sekali.
 */
export async function getDisplayFormatter(): Promise<
  (amount: string | number | null | undefined, originalCurrency: string) => string
> {
  const mode = getViewMode();
  if (mode === "native") {
    return (amount, currency) => formatMoney(amount, currency);
  }
  const rates = await getRates();
  return (amount, currency) => {
    const value = toNumber(amount);
    const usd = convertToUSD(value, currency, rates);
    if (usd === null) {
      // Currency tidak ada rate-nya — tampil native dengan tanda "?"
      return formatMoney(amount, currency) + " (?)";
    }
    return formatMoney(usd, "USD") + " *";
  };
}
