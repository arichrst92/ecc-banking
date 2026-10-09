import { Fragment } from "react";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { getRates } from "@/lib/exchange-rate";
import { FISCAL_MONTHS as MONTHS, computeFiscalMatrix, type GroupBlock } from "@/lib/fiscal";
import { FiskalFilters } from "./fiskal-filters";

export const dynamic = "force-dynamic";

export default async function FiskalPage({
  searchParams,
}: {
  searchParams: { year?: string; currency?: string; branch?: string; view?: string };
}) {
  const session = getSession()!;
  const isGlobal = session.role === "global";

  // ── Rates & currency ──
  const rates = await getRates();
  const currencies = Object.keys(rates).sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));
  const currency = (searchParams.currency ?? "IDR").toUpperCase();
  const displayCurrency = rates[currency] !== undefined ? currency : "IDR";
  const dec = displayCurrency === "IDR" ? 0 : 2;
  const nf = new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const cell = (n: number) => (Math.abs(n) < 0.005 ? "" : nf.format(n));
  const cellZero = (n: number) => nf.format(Math.abs(n) < 0.005 ? 0 : n);

  // ── Year ──
  const yearRows = await query<{ y: number }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM tx_date)::INT AS y FROM transactions WHERE archived_at IS NULL ORDER BY y DESC`
  );
  const nowYear = new Date().getFullYear();
  const years = Array.from(new Set([nowYear, ...yearRows.map((r) => r.y)])).sort((a, b) => b - a);
  const year = Number(searchParams.year) || nowYear;

  // ── Branch scope ──
  const branchList = isGlobal
    ? await query<{ id: number; name: string; code: string }>(`SELECT id, name, code FROM branches ORDER BY name`)
    : [];
  const branchParam = searchParams.branch ?? "all";
  const filterBranchId = isGlobal
    ? branchParam === "all"
      ? null
      : Number(branchParam) || null
    : session.branchId ?? null;
  const branchOptions = [
    { value: "all", label: "Konsolidasi — Semua Cabang" },
    ...branchList.map((b) => ({ value: String(b.id), label: `${b.name} (${b.code})` })),
  ];
  const activeBranchLabel = isGlobal
    ? filterBranchId
      ? branchOptions.find((b) => b.value === String(filterBranchId))?.label ?? "Cabang"
      : "Konsolidasi — Semua Cabang"
    : "Cabang Anda";

  const view = (["actual", "budget", "compare"].includes(searchParams.view ?? "") ? searchParams.view : "actual") as
    | "actual"
    | "budget"
    | "compare";

  // ── Data (realisasi + anggaran per kategori × 12 bulan) ──
  const { actual, budget, blocks } = await computeFiscalMatrix({
    year,
    filterBranchId,
    displayCurrency,
    rates,
  });

  const sumArr = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const addInto = (target: number[], src: number[]) => {
    for (let i = 0; i < 12; i++) target[i] += src[i];
  };
  const sign = (k: string) => (k === "expense" ? -1 : 1);

  // Net (surplus/deficit) per month across all blocks
  const matrix = view === "budget" ? budget : actual;
  const net = new Array(12).fill(0);
  for (const blk of blocks) {
    for (const c of blk.cats) {
      const row = matrix.get(c.id);
      if (!row) continue;
      for (let i = 0; i < 12; i++) net[i] += sign(blk.kind) * row[i];
    }
  }

  // Summary totals (annual)
  let revTotal = 0;
  let expTotal = 0;
  for (const blk of blocks) {
    for (const c of blk.cats) {
      const row = matrix.get(c.id);
      if (!row) continue;
      const t = sumArr(row);
      if (blk.kind === "revenue") revTotal += t;
      else if (blk.kind === "expense") expTotal += t;
    }
  }
  const netTotal = revTotal - expTotal;

  const thMon = "text-right py-1.5 px-2 text-[10px] font-semibold text-ink-3 whitespace-nowrap";
  const tdMon = "text-right py-1.5 px-2 text-[12px] tabular-nums whitespace-nowrap";

  return (
    <div className="fiskal-report">
      <Topbar
        title="Laporan Fiskal"
        role={session.role}
        subtitle="Chart of Accounts per bulan — konsolidasi semua cabang atau per cabang."
      />

      <div className="card mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiskalFilters
          years={years}
          currencies={currencies}
          branches={branchOptions}
          showBranch={isGlobal}
          showView={true}
          current={{ year: String(year), currency: displayCurrency, branch: branchParam, view }}
        />
        <div className="flex items-end gap-2 print-hide">
          <a
            href={`/fiskal/export-pdf?year=${year}&currency=${displayCurrency}&branch=${branchParam}&view=${view}`}
            className="btn btn-outline btn-sm"
            target="_blank"
            rel="noopener"
          >
            ⬇ Export PDF
          </a>
          <a
            href={`/fiskal/export?year=${year}&currency=${displayCurrency}&branch=${branchParam}&view=${view}`}
            className="btn btn-gold btn-sm"
          >
            ⬇ Export Excel
          </a>
        </div>
      </div>

      {/* Ringkasan filter — tampil saat print */}
      <div className="print-only mb-3">
        <h2 className="font-serif text-lg">
          ECC — Laporan Fiskal {year} · {activeBranchLabel} · {displayCurrency} ·{" "}
          {view === "budget" ? "Anggaran" : view === "compare" ? "Actual vs Budget" : "Realisasi"}
        </h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3">Total Revenue</div>
          <div className="text-[18px] font-semibold text-good mt-1">{displayCurrency} {cellZero(revTotal)}</div>
        </div>
        <div className="card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3">Total Expenses</div>
          <div className="text-[18px] font-semibold text-bad-2 mt-1">{displayCurrency} {cellZero(expTotal)}</div>
        </div>
        <div className="card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3">
            {netTotal >= 0 ? "Surplus" : "Defisit"} ({view === "budget" ? "Budget" : "Actual"})
          </div>
          <div className={`text-[18px] font-semibold mt-1 ${netTotal >= 0 ? "text-good" : "text-bad-2"}`}>
            {displayCurrency} {cellZero(netTotal)}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-2 text-[12px] text-ink-3">
          Nilai dalam <span className="font-semibold">{displayCurrency}</span>. Sel kosong = tidak ada nilai.
          {displayCurrency !== "IDR" && " Dikonversi dari mata uang asli pakai kurs terakhir."}
        </div>

        {view === "compare" ? (
          <CompareTable blocks={blocks} actual={actual} budget={budget} nf={nf} displayCurrency={displayCurrency} />
        ) : (
          <table className="w-full border-collapse fiskal-matrix">
            <thead>
              <tr className="border-b-2 border-ink/20">
                <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-ink-3 w-[70px]">Account</th>
                <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-ink-3 min-w-[220px]">Account Description</th>
                {MONTHS.map((m) => (
                  <th key={m} className={thMon}>{m}</th>
                ))}
                <th className={thMon + " font-bold"}>Total</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((blk) => {
                const sub = new Array(12).fill(0);
                for (const c of blk.cats) {
                  const row = matrix.get(c.id);
                  if (row) addInto(sub, row);
                }
                return (
                  <GroupRows
                    key={blk.key}
                    blk={blk}
                    matrix={matrix}
                    sub={sub}
                    cell={cell}
                    nf={nf}
                    tdMon={tdMon}
                  />
                );
              })}
              {/* Net row */}
              <tr className="fm-net border-t-2 border-ink/30 bg-cream font-bold">
                <td className="py-2 px-2" />
                <td className="py-2 px-2 text-[12px]">NET SURPLUS / (DEFICIT)</td>
                {net.map((v, i) => (
                  <td key={i} className={tdMon + (v < 0 ? " text-bad-2" : "")}>{cell(v)}</td>
                ))}
                <td className={tdMon + (sumArr(net) < 0 ? " text-bad-2" : "")}>{nf.format(sumArr(net))}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {view !== "compare" && (
        <p className="text-[11px] text-ink-3 mt-3 print-hide">
          Angka diambil otomatis dari transaksi (Realisasi) dan dari input Anggaran. Untuk mengisi anggaran, buka{" "}
          <a href={`/fiskal/budget?year=${year}${filterBranchId ? `&branch=${filterBranchId}` : ""}`} className="text-brand-orange font-medium">
            Input Anggaran
          </a>
          .
        </p>
      )}

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

function GroupRows({
  blk,
  matrix,
  sub,
  cell,
  nf,
  tdMon,
}: {
  blk: GroupBlock;
  matrix: Map<number, number[]>;
  sub: number[];
  cell: (n: number) => string;
  nf: Intl.NumberFormat;
  tdMon: string;
}) {
  const subTotal = sub.reduce((s, x) => s + x, 0);
  return (
    <>
      <tr className="fm-grp bg-navy/5 border-y border-ink/10">
        <td className="py-1.5 px-2 text-[11px] font-bold text-navy uppercase" colSpan={15}>
          {blk.name}
        </td>
      </tr>
      {blk.cats.map((c) => {
        const row = matrix.get(c.id) ?? new Array(12).fill(0);
        const total = row.reduce((s, x) => s + x, 0);
        return (
          <tr key={c.id} className="border-b border-line hover:bg-cream">
            <td className="py-1.5 px-2 text-[12px] font-mono text-ink-2">{c.account_code ?? ""}</td>
            <td className="py-1.5 px-2 text-[12px]">{c.name}</td>
            {row.map((v, i) => (
              <td key={i} className={tdMon}>{cell(v)}</td>
            ))}
            <td className={tdMon + " font-semibold"}>{cell(total)}</td>
          </tr>
        );
      })}
      <tr className="fm-sub border-b border-ink/10 bg-cream/60 font-semibold">
        <td className="py-1.5 px-2" />
        <td className="py-1.5 px-2 text-[11px] text-ink-2">Subtotal {blk.name}</td>
        {sub.map((v, i) => (
          <td key={i} className={tdMon}>{cell(v)}</td>
        ))}
        <td className={tdMon}>{nf.format(subTotal)}</td>
      </tr>
    </>
  );
}

function CompareTable({
  blocks,
  actual,
  budget,
  nf,
  displayCurrency,
}: {
  blocks: GroupBlock[];
  actual: Map<number, number[]>;
  budget: Map<number, number[]>;
  nf: Intl.NumberFormat;
  displayCurrency: string;
}) {
  const sum = (a: number[] | undefined) => (a ? a.reduce((s, x) => s + x, 0) : 0);
  const td = "text-right py-1.5 px-2 text-[12px] tabular-nums whitespace-nowrap";
  return (
    <table className="w-full border-collapse fiskal-matrix">
      <thead>
        <tr className="border-b-2 border-ink/20">
          <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-ink-3 w-[70px]">Account</th>
          <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-ink-3 min-w-[220px]">Account Description</th>
          <th className={td + " text-[10px] font-semibold text-ink-3"}>Actual</th>
          <th className={td + " text-[10px] font-semibold text-ink-3"}>Budget</th>
          <th className={td + " text-[10px] font-semibold text-ink-3"}>Variance</th>
          <th className={td + " text-[10px] font-semibold text-ink-3"}>%</th>
        </tr>
      </thead>
      <tbody>
        {blocks.map((blk) => (
          <Fragment key={blk.key}>
            <tr className="fm-grp bg-navy/5 border-y border-ink/10">
              <td className="py-1.5 px-2 text-[11px] font-bold text-navy uppercase" colSpan={6}>{blk.name}</td>
            </tr>
            {blk.cats.map((c) => {
              const a = sum(actual.get(c.id));
              const b = sum(budget.get(c.id));
              const v = a - b;
              const pct = b !== 0 ? (a / b) * 100 : a !== 0 ? 100 : 0;
              return (
                <tr key={c.id} className="border-b border-line hover:bg-cream">
                  <td className="py-1.5 px-2 text-[12px] font-mono text-ink-2">{c.account_code ?? ""}</td>
                  <td className="py-1.5 px-2 text-[12px]">{c.name}</td>
                  <td className={td}>{a ? nf.format(a) : ""}</td>
                  <td className={td}>{b ? nf.format(b) : ""}</td>
                  <td className={td + (v < 0 ? " text-bad-2" : "")}>{v ? nf.format(v) : ""}</td>
                  <td className={td + " text-ink-3"}>{b || a ? pct.toFixed(0) + "%" : ""}</td>
                </tr>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
