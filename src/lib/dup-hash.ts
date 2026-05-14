import { createHash } from "node:crypto";

/**
 * Hash unik per transaksi untuk dedup.
 * Sama account + tanggal + nominal + description_normalized → dianggap duplikat.
 */
export function computeDupHash(
  accountId: number,
  txDate: string,
  debit: number,
  credit: number,
  descriptionNormalized: string
): string {
  const key = [
    accountId,
    txDate,
    debit.toFixed(2),
    credit.toFixed(2),
    descriptionNormalized,
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}
