import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { getRates } from "@/lib/exchange-rate";
import { computeMonthDetail } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";

export default async function FiskalBulanPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string; currency?: string; branch?: string };
}) {
  const session = getSession()!;
  const isGlobal = session.role === "global";

  const rates = await getRates();
  const currency = (searchParams.currency ?? "IDR").toUpperCase();
  const displayCurrency = rates[currency] !== undefined ? currency : "IDR";

  const year = Number(searchParams.year) || new Date().getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.month) || 1));
  const branchParam = searchParams.branch ?? "all";
  const filterBranchId = isGlobal ? (branchParam === "all" ? null : Number(branchParam) || null) : session.branchId ?? null;

  if (!session) redirect("/login");

  let branchLabel = "Konsolidasi — Semua Cabang";
  if (filterBranchId) {
    const b = await queryOne<{ name: string; code: string }>(`SELECT name, code FROM branches WHERE id=$1`, [filterBranchId]);
    branchLabel = b ? `${b.name} (${b.code})` : "Cabang";
  } else if (!isGlobal) {
    branchLabel = "Cabang Anda";
  }

  const detail = await computeMonthDetail({ year, month, filterBranchId, displayCurrency, rates });
  const dec = displayCurrency === "IDR" ? 0 : 2;
  const nf = new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const money = (n: number) => nf.format(n);
  const cellMoney = (n: number) => (Math.abs(n) < 0.005 ? "-" : nf.format(n));

  const qs = `month=${month}&year=${year}&currency=${displayCurrency}&branch=${branchParam}`;

  return (
    <div className="fiskal-report">
      <Topbar
        title="Detail Fiskal"
        role={session.role}
        subtitle={`${detail.monthName} ${year} · ${branchLabel} · ${displayCurrency}`}
      />

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/fiskal?year=${year}&currency=${displayCurrency}&branch=${branchParam}`} className="btn btn-outline btn-sm">
          ← Laporan Fiskal
        </Link>
        <div className="flex gap-2">
          <a href={`/fiskal/bulan/export-pdf?${qs}`} className="btn btn-outline btn-sm" target="_blank" rel="noopener">⬇ Export PDF</a>
          <a href={`/fiskal/bulan/export?${qs}`} className="btn btn-gold btn-sm">⬇ Export Excel</a>
        </div>
      </div>

      {/* ── Statement of Activity ── */}
      <div className="card mb-5">
        <h2 className="font-serif text-lg text-navy mb-1">Statement of Activity</h2>
        <p className="text-[11px] text-ink-3 mb-4">{detail.monthName} {year} · Nilai dalam {displayCurrency}</p>

        <table className="w-full text-[13px]">
          <tbody>
            {detail.soaBlocks.map((blk) => (
              <Fragment key={blk.name}>
                <tr className="border-b border-line">
                  <td colSpan={3} className="pt-3 pb-1 font-bold text-navy text-[12px] uppercase tracking-wide">{blk.name}</td>
                </tr>
                {blk.cats.map((c) => (
                  <tr key={`${c.code}-${c.name}`} className="border-b border-line/60">
                    <td className="py-1.5 pl-4 pr-2 font-mono text-ink-3 w-[70px] text-[12px]">{c.code ?? ""}</td>
                    <td className="py-1.5 px-2">{c.name}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{displayCurrency} {cellMoney(c.total)}</td>
                  </tr>
                ))}
                <tr className={blk.kind === "revenue" ? "bg-good/10" : "bg-bad/10"}>
                  <td colSpan={2} className="py-2 px-2 font-bold">Total {blk.name}</td>
                  <td className="py-2 px-2 text-right font-bold tabular-nums">{displayCurrency} {money(blk.subtotal)}</td>
                </tr>
              </Fragment>
            ))}
            <tr className="border-t-2 border-ink/30">
              <td colSpan={2} className="py-3 px-2 font-bold text-[14px]">
                Net: Income Gain / (Loss)
              </td>
              <td className={`py-3 px-2 text-right font-bold text-[14px] tabular-nums ${detail.net >= 0 ? "text-good" : "text-bad-2"}`}>
                {displayCurrency} {money(detail.net)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── General Ledger ── */}
      <div className="card">
        <h2 className="font-serif text-lg text-navy mb-1">General Ledger</h2>
        <p className="text-[11px] text-ink-3 mb-4">{detail.monthName} {year} · Nilai dalam {displayCurrency}</p>

        <div className="space-y-5">
          {detail.ledger.map((acc) => (
            <div key={`${acc.code}-${acc.name}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-bold text-navy text-[13px]">{acc.code ?? ""}</span>
                <span className="font-bold text-[13px]">{acc.name}</span>
              </div>
              <table className="w-full text-[12px] border border-line">
                <thead>
                  <tr className="bg-cream text-ink-3 text-[10px] uppercase tracking-wide">
                    <th className="text-left py-1.5 px-2 w-[90px]">Tanggal</th>
                    <th className="text-left py-1.5 px-2">Item Description</th>
                    <th className="text-right py-1.5 px-2 w-[120px]">Expenses</th>
                    <th className="text-right py-1.5 px-2 w-[120px]">Income</th>
                    <th className="text-right py-1.5 px-2 w-[120px]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {acc.txns.length === 0 && (
                    <tr><td colSpan={5} className="py-2 px-2 text-center text-ink-3 italic">— tidak ada transaksi —</td></tr>
                  )}
                  {acc.txns.map((t, i) => (
                    <tr key={i} className="border-t border-line/60">
                      <td className="py-1.5 px-2 text-ink-2">{t.date}</td>
                      <td className="py-1.5 px-2">{t.desc}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{t.expense ? money(t.expense) : ""}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{t.income ? money(t.income) : ""}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{money(t.balance)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-ink/20 bg-cream/60 font-semibold">
                    <td colSpan={2} className="py-1.5 px-2 text-right">Total</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{cellMoney(acc.totExpense)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{cellMoney(acc.totIncome)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{cellMoney(acc.totIncome - acc.totExpense)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-line flex items-center justify-center gap-2.5">
        <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3">Powered by</span>
        <span className="inline-flex items-center bg-white rounded-md px-2 py-1 shadow-sm border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-idea.webp" alt="IDEA" className="h-3.5 w-auto" />
        </span>
      </div>
    </div>
  );
}
