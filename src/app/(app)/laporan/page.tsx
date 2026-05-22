import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/format";
import { ChartLine } from "@/components/chart-line";
import { ChartDoughnut } from "@/components/chart-doughnut";

export const dynamic = "force-dynamic";

type Branch = { id: number; name: string; code: string };
type Account = { id: number; bank: string; account_number: string; purpose: string; currency: string | null };

function getDefaultPeriod() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(from), to: fmt(to) };
}

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: { branch_id?: string; account_id?: string; from?: string; to?: string };
}) {
  const session = getSession()!;

  const period = {
    from: searchParams.from ?? getDefaultPeriod().from,
    to: searchParams.to ?? getDefaultPeriod().to,
  };

  // RBAC: branch role locked to own branch
  const filterBranchId = session.role === "branch"
    ? session.branchId
    : (searchParams.branch_id ? Number(searchParams.branch_id) : null);

  const filterAccountId = searchParams.account_id ? Number(searchParams.account_id) : null;

  // Branches (untuk filter dropdown)
  const branches = await query<Branch>(
    session.role === "branch"
      ? `SELECT id, name, code FROM branches WHERE id = $1`
      : `SELECT id, name, code FROM branches WHERE status='aktif' ORDER BY name`,
    session.role === "branch" ? [session.branchId] : []
  );

  // Accounts (untuk tab bar — hanya kalau cabang sudah dipilih)
  const accounts = filterBranchId
    ? await query<Account>(
        `SELECT id, bank, account_number, purpose, currency
           FROM accounts
          WHERE branch_id = $1 AND status = 'aktif'
          ORDER BY bank, account_number`,
        [filterBranchId]
      )
    : [];

  // Build WHERE clause untuk semua query
  const whereParts: string[] = [
    `t.tx_date BETWEEN $1 AND $2`,
    `t.archived_at IS NULL`,
  ];
  const params: unknown[] = [period.from, period.to];
  if (filterBranchId) {
    params.push(filterBranchId);
    whereParts.push(`t.branch_id = $${params.length}`);
  }
  if (filterAccountId) {
    params.push(filterAccountId);
    whereParts.push(`t.account_id = $${params.length}`);
  }
  const whereSql = whereParts.join(" AND ");

  // Summary per currency
  type Summary = { currency: string; total_in: string; total_out: string; tx_count: number };
  const summary = await query<Summary>(
    `SELECT t.currency,
            COALESCE(SUM(t.credit), 0)::TEXT AS total_in,
            COALESCE(SUM(t.debit), 0)::TEXT AS total_out,
            COUNT(*)::INT AS tx_count
       FROM transactions t
      WHERE ${whereSql}
      GROUP BY t.currency
      ORDER BY t.currency`,
    params
  );

  // Daily aggregation untuk line chart
  type Daily = { tx_date: string; currency: string; daily_in: string; daily_out: string };
  const daily = await query<Daily>(
    `SELECT t.tx_date::TEXT AS tx_date, t.currency,
            COALESCE(SUM(t.credit), 0)::TEXT AS daily_in,
            COALESCE(SUM(t.debit), 0)::TEXT AS daily_out
       FROM transactions t
      WHERE ${whereSql}
      GROUP BY t.tx_date, t.currency
      ORDER BY t.tx_date ASC`,
    params
  );

  // Per kategori (untuk pie chart + tabel)
  type CatRow = {
    category_id: number;
    name: string;
    color: string;
    type: string;
    currency: string;
    total_in: string;
    total_out: string;
    tx_count: number;
  };
  const byCat = await query<CatRow>(
    `SELECT c.id AS category_id, c.name, c.color, c.type, t.currency,
            COALESCE(SUM(t.credit), 0)::TEXT AS total_in,
            COALESCE(SUM(t.debit), 0)::TEXT AS total_out,
            COUNT(*)::INT AS tx_count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE ${whereSql}
      GROUP BY c.id, c.name, c.color, c.type, t.currency
      ORDER BY t.currency, (SUM(t.debit) + SUM(t.credit)) DESC`,
    params
  );

  // Buat line chart data per currency
  const currencies = Array.from(new Set(daily.map((d) => d.currency))).sort();

  return (
    <>
      <Topbar
        title="Laporan Keuangan"
        role={session.role}
        subtitle={`Periode ${formatDate(period.from)} — ${formatDate(period.to)}`}
      />

      {/* Filter bar */}
      <div className="card mb-4">
        <form className="flex flex-wrap items-end gap-3">
          {session.role === "global" && (
            <div className="flex-1 min-w-[180px]">
              <label className="form-label">Cabang</label>
              <select
                name="branch_id"
                className="form-select"
                defaultValue={filterBranchId ?? ""}
              >
                <option value="">— Semua (Konsolidasi) —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1 min-w-[160px]">
            <label className="form-label">Dari</label>
            <input type="date" name="from" className="form-input" defaultValue={period.from} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="form-label">Sampai</label>
            <input type="date" name="to" className="form-input" defaultValue={period.to} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Terapkan</button>
            <Link href="/laporan" className="btn btn-outline">Reset</Link>
          </div>
        </form>
      </div>

      {/* Tab rekening (kalau cabang dipilih) */}
      {filterBranchId && accounts.length > 0 && (
        <div className="card mb-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
            Rekening — pilih untuk filter
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/laporan?branch_id=${filterBranchId}&from=${period.from}&to=${period.to}`}
              className={
                !filterAccountId
                  ? "btn btn-primary btn-sm"
                  : "btn btn-outline btn-sm"
              }
            >
              Semua Rekening
            </Link>
            {accounts.map((a) => {
              const last4 = a.account_number.slice(-4);
              return (
                <Link
                  key={a.id}
                  href={`/laporan?branch_id=${filterBranchId}&account_id=${a.id}&from=${period.from}&to=${period.to}`}
                  className={
                    filterAccountId === a.id
                      ? "btn btn-primary btn-sm"
                      : "btn btn-outline btn-sm"
                  }
                >
                  {a.bank} — {last4} · {a.purpose}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Report header per currency */}
      {summary.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[14px] text-ink-3 mb-2">Belum ada transaksi di periode ini.</p>
          <p className="text-[12px] text-ink-3">
            <Link href="/upload" className="text-info underline">Upload mutasi</Link> dulu, atau ganti periode filter.
          </p>
        </div>
      ) : (
        summary.map((s) => {
          const net = parseFloat(s.total_in) - parseFloat(s.total_out);
          const dailyCur = daily.filter((d) => d.currency === s.currency);

          // Buat cumulative line data
          const dailyMap = new Map<string, { in: number; out: number }>();
          dailyCur.forEach((d) => {
            dailyMap.set(d.tx_date, {
              in: parseFloat(d.daily_in),
              out: parseFloat(d.daily_out),
            });
          });
          const sortedDates = Array.from(dailyMap.keys()).sort();
          const labels = sortedDates.map((d) => {
            const dt = new Date(d);
            return dt.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
          });
          let cumIn = 0, cumOut = 0;
          const cumInArr: number[] = [];
          const cumOutArr: number[] = [];
          sortedDates.forEach((d) => {
            const v = dailyMap.get(d)!;
            cumIn += v.in;
            cumOut += v.out;
            cumInArr.push(cumIn);
            cumOutArr.push(cumOut);
          });

          // Pie chart: pengeluaran per kategori
          const catRowsForCur = byCat.filter(
            (c) => c.currency === s.currency && parseFloat(c.total_out) > 0
          );
          const pieLabels = catRowsForCur.map((c) => c.name);
          const pieValues = catRowsForCur.map((c) => parseFloat(c.total_out));
          const pieColors = catRowsForCur.map((c) => c.color);

          return (
            <div key={s.currency} className="mb-6">
              {/* Header gradient */}
              <div className="rounded-2xl p-7 mb-4 text-white relative overflow-hidden"
                   style={{ background: "linear-gradient(135deg, #0f1d3a 0%, #1e3a6e 100%)" }}>
                <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-gold/10" />
                <div className="relative">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-white/45 mb-1">
                    Laporan Keuangan · {s.currency}
                  </div>
                  <h2 className="font-serif text-2xl font-light mb-0.5">
                    {filterBranchId
                      ? branches.find((b) => b.id === filterBranchId)?.name ?? "Cabang"
                      : "Konsolidasi Semua Cabang"}
                  </h2>
                  <div className="text-[12px] text-white/50 mb-4">
                    {formatDate(period.from)} — {formatDate(period.to)}
                  </div>
                  <div className="flex gap-7 flex-wrap">
                    <div>
                      <div className="text-[10px] text-white/50 mb-0.5">PEMASUKAN</div>
                      <div className="text-[20px] font-bold text-[#7ee8c5]">
                        {formatMoney(s.total_in, s.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-white/50 mb-0.5">PENGELUARAN</div>
                      <div className="text-[20px] font-bold text-[#f5a9a3]">
                        {formatMoney(s.total_out, s.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-white/50 mb-0.5">SALDO NETO</div>
                      <div className={`text-[20px] font-bold ${
                        net >= 0 ? "text-[#7ee8c5]" : "text-[#f5a9a3]"
                      }`}>
                        {net >= 0 ? "+" : ""}{formatMoney(net, s.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-white/50 mb-0.5">TRANSAKSI</div>
                      <div className="text-[20px] font-bold">{s.tx_count}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="card">
                  <h3 className="font-semibold text-[13px] mb-3">Tren Kumulatif</h3>
                  {labels.length > 0 ? (
                    <ChartLine
                      labels={labels}
                      datasets={[
                        { label: "Pemasukan kumulatif", data: cumInArr, color: "#2e7d6e" },
                        { label: "Pengeluaran kumulatif", data: cumOutArr, color: "#c0392b" },
                      ]}
                      height={260}
                      currency={s.currency}
                    />
                  ) : (
                    <p className="text-[12px] text-ink-3 text-center py-12">Tidak ada data</p>
                  )}
                </div>

                <div className="card">
                  <h3 className="font-semibold text-[13px] mb-3">Proporsi Pengeluaran per Kategori</h3>
                  {pieValues.length > 0 ? (
                    <ChartDoughnut
                      labels={pieLabels}
                      values={pieValues}
                      colors={pieColors}
                      height={260}
                      currency={s.currency}
                    />
                  ) : (
                    <p className="text-[12px] text-ink-3 text-center py-12">Tidak ada pengeluaran</p>
                  )}
                </div>
              </div>

              {/* Rincian kategori */}
              <div className="card">
                <h3 className="font-semibold text-[13px] mb-3">Rincian per Kategori ({s.currency})</h3>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kategori</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Trx</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Pemasukan</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Pengeluaran</th>
                      <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCat
                      .filter((c) => c.currency === s.currency)
                      .map((c) => {
                        const cIn = parseFloat(c.total_in);
                        const cOut = parseFloat(c.total_out);
                        const cNet = cIn - cOut;
                        return (
                          <tr key={c.category_id} className="border-b border-line">
                            <td className="py-2 px-2">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                                style={{ background: c.color }}
                              />
                              <span className="font-medium">{c.name}</span>
                            </td>
                            <td className="py-2 px-2 text-right text-ink-2">{c.tx_count}</td>
                            <td className="py-2 px-2 text-right text-good">
                              {cIn > 0 ? formatMoney(cIn, s.currency) : "—"}
                            </td>
                            <td className="py-2 px-2 text-right text-bad-2">
                              {cOut > 0 ? formatMoney(cOut, s.currency) : "—"}
                            </td>
                            <td className={`py-2 px-2 text-right font-semibold ${
                              cNet >= 0 ? "text-good" : "text-bad-2"
                            }`}>
                              {cNet >= 0 ? "+" : ""}{formatMoney(cNet, s.currency)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
