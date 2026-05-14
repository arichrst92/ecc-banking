// Format helpers untuk display di UI.

export function formatMoney(amount: string | number | null | undefined, currency = "IDR"): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("id-ID")}`;
  }
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function maskAccountNumber(no: string): string {
  if (no.length <= 6) return no;
  return no.slice(0, 3) + "***" + no.slice(-3);
}
