import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { getRates } from "@/lib/exchange-rate";
import { FiskalFilters } from "../fiskal-filters";
import { saveBudgetAction } from "./actions";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type CatRow = {
  id: number;
  name: string;
  account_code: string | null;
  group_name: string | null;
};

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: { year?: string; currency?: string; branch?: string; err?: string; msg?: string };
}) {
  const session = getSession()!;
  const isGlobal = session.role === "global";

  const rates = await getRates();
  const currencies = Object.keys(rates).sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));
  const currency = (searchParams.currency ?? "IDR").toUpperCase();
  const displayCurrency = rates[currency] !== undefined ? currency : "IDR";

  const nowYear = new Date().getFullYear();
  const yearRows = await query<{ y: number }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM tx_date)::INT AS y FROM transactions WHERE archived_at IS NULL ORDER BY y DESC`
  );
  const years = Array.from(new Set([nowYear, nowYear + 1, ...yearRows.map((r) => r.y)])).sort((a, b) => b - a);
  const year = Number(searchParams.year) || nowYear;

  const branchList = isGlobal
    ? await query<{ id: number; name: string; code: string }>(`SELECT id, name, code FROM branches ORDER BY name`)
    : [];

  let branchId: number;
  if (isGlobal) {
    branchId = Number(searchParams.branch) || branchList[0]?.id || 0;
  } else {
    branchId = session.branchId!;
  }
  const branchOptions = branchList.map((b) => ({ value: String(b.id), label: `${b.name} (${b.code})` }));

  // Hanya kategori ber-grup yang relevan untuk anggaran
  const cats = await query<CatRow>(
    `SELECT c.id, c.name, c.account_code, g.name AS group_name
       FROM categories c
       LEFT JOIN category_groups g ON g.id = c.group_id
      WHERE c.group_id IS NOT NULL
      ORDER BY g.display_order NULLS LAST, c.account_code NULLS LAST, c.priority, c.name`
  );

  // Existing budget values
  const existing = branchId
    ? await query<{ category_id: number; month: number; amount: string }>(
        `SELECT category_id, month, amount::TEXT AS amount
           FROM fiscal_budgets WHERE branch_id = $1 AND fiscal_year = $2`,
        [branchId, year]
      )
    : [];
  const valMap = new Map<string, string>();
  for (const e of existing) valMap.set(`${e.category_id}_${e.month}`, e.amount);
  const valOf = (catId: number, month: number) => {
    const v = valMap.get(`${catId}_${month}`);
    if (!v) return "";
    const n = parseFloat(v);
    return Number.isInteger(n) ? String(n) : String(n);
  };

  return (
    <>
      <Topbar
        title="Input Anggaran"
        role={session.role}
        subtitle="Anggaran bulanan per cabang. Dipakai di Laporan Fiskal (Actual vs Budget)."
      />

      {searchParams.err && (
        <div className="card bg-[#fef3f2] border-[#f5c5c2] mb-4">
          <p className="text-[12px] text-bad-2">{searchParams.err}</p>
        </div>
      )}
      {searchParams.msg && (
        <div className="card bg-[#eef8f5] border-[#b8ddd8] mb-4">
          <p className="text-[12px] text-good">{searchParams.msg}</p>
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-end justify-between gap-3">
        <FiskalFilters
          years={years}
          currencies={currencies}
          branches={branchOptions}
          showBranch={isGlobal}
          showView={false}
          current={{ year: String(year), currency: displayCurrency, branch: String(branchId), view: "" }}
        />
        <Link href={`/fiskal?year=${year}&currency=${displayCurrency}${isGlobal ? `&branch=${branchId}` : ""}`} className="btn btn-outline btn-sm">
          ← Laporan Fiskal
        </Link>
      </div>

      {cats.length === 0 ? (
        <div className="card text-center text-ink-3 text-[13px] py-8">
          Belum ada kategori ber-grup. Tambahkan grup di{" "}
          <Link href="/kategori/grup" className="text-brand-orange">Grup Kategori</Link> dulu.
        </div>
      ) : (
        <form action={saveBudgetAction}>
          <input type="hidden" name="fiscal_year" value={year} />
          <input type="hidden" name="currency" value={displayCurrency} />
          <input type="hidden" name="branch_id" value={branchId} />

          <div className="card overflow-x-auto">
            <div className="mb-2 text-[12px] text-ink-3">
              Angka dalam <span className="font-semibold">{displayCurrency}</span>. Kosongkan / 0 kalau tidak ada anggaran.
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ink/20">
                  <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-ink-3 w-[70px]">Account</th>
                  <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-ink-3 min-w-[200px]">Description</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="text-right py-1.5 px-1 text-[10px] font-semibold text-ink-3">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className="py-1 px-2 text-[12px] font-mono text-ink-2">{c.account_code ?? ""}</td>
                    <td className="py-1 px-2 text-[12px]">{c.name}</td>
                    {MONTHS.map((_, i) => (
                      <td key={i} className="py-1 px-1">
                        <input
                          name={`amt_${c.id}_${i + 1}`}
                          defaultValue={valOf(c.id, i + 1)}
                          inputMode="decimal"
                          className="w-[72px] text-right text-[12px] border border-line rounded px-1 py-0.5 tabular-nums focus:border-brand-orange outline-none"
                          placeholder="0"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Link href="/fiskal" className="btn btn-outline">Batal</Link>
            <button type="submit" className="btn btn-primary">Simpan Anggaran</button>
          </div>
        </form>
      )}
    </>
  );
}
