// View mode state: native (default) atau usd.
// Disimpan di cookie `ecc_view_mode` supaya persist cross-page.

import { cookies } from "next/headers";
import { formatMoney } from "./format";
import { convertToUSD, toNumber } from "./exchange-rate";

export type ViewMode = "native" | "usd";

const COOKIE_NAME = "ecc_view_mode";

export function getViewMode(): ViewMode {
  try {
    const v = cookies().get(COOKIE_NAME)?.value;
    return v === "usd" ? "usd" : "native";
  } catch {
    // cookies() di-call dari context yg tidak support (mis. static gen). Fallback.
    return "native";
  }
}

/**
 * Return formatter function untuk display amount.
 * Kalau view=usd dan currency punya rate → convert + format USD.
 * Kalau tidak → format pakai currency asli.
 *
 * Pages call sekali di awal lalu pakai variable ini di semua tempat formatMoney.
 */
export function getDisplayFormatter(): (
  amount: string | number | null | undefined,
  originalCurrency: string
) => string {
  const mode = getViewMode();
  if (mode === "native") {
    return (amount, currency) => formatMoney(amount, currency);
  }
  return (amount, currency) => {
    const value = toNumber(amount);
    const usd = convertToUSD(value, currency);
    if (usd === null) {
      // Currency tidak dikenal — fallback ke native
      return formatMoney(amount, currency);
    }
    return formatMoney(usd, "USD") + " *";
    // Asterisk visual cue: "converted, not actual currency"
  };
}

/**
 * Return label informatif untuk header banner: "View dalam USD (kurs: 1 USD = 15,800 IDR ...)".
 */
export function getViewModeLabel(viewMode: ViewMode): string {
  if (viewMode === "native") return "Native (mata uang asli)";
  return "Display dalam USD";
}
