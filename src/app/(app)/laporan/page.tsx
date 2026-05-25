import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/format";
import { ChartLine } from "@/components/chart-line";
import { ChartDoughnut } from "@/components/chart-doughnut";
import { getCascadeOptions, buildTxWhere } from "@/lib/hierarchy";

export const dynamic = "force-dynamic";

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
  searchParams: {
    branch_id?: string; segment_id?: string; sub_id?: string; account_id?: string;
    from?: string; to?: string;
  };
}) {
  const session = getSession()!;

  const period = {
    from: searchParams.from ?? getDefaultPeriod().from,
    to: searchParams.to ?? getDefaultPeriod().to,
  };

  // RBAC: branch role locked to own branch
  const filterBranchId = session.role === "branch"
    ? session.branchId!
    : (searchParams.branch_id ? Number(searchParams.branch_id) : null);
  const filterSegmentId = searchParams.segment_id ? Number(searchParams.segment_id) : null;
  const filterSubId = searchParams.sub_id ? Number(searchParams.sub_id) : null;
  const filterAccountId = searchParams.account_id ? Number(searchParams.account_id) : null;

  // Cascade options
  const cascade = await getCascadeOptions(
    { branchId: filterBranchId, segmentId: filterSegmentId, subId: filterSubId },
    session.role,
    session.branchId
  );

  // Build WHERE clause untuk semua query
  const whereParts: string[] = [
    `t.tx_date BETWEEN $1 AND $2`,
    `t.archived_at IS NULL`,
  ];
  const params: unknown[] = [period.from, period.to];

  const hier = buildTxWhere(
    { branchId: filterBranchId ?? undefined, segmentId: filterSegmentId ?? undefined,
      subId: filterSubId ?? undefined, accountId: filterAccountId ?? undefined },
    params.length + 1
  );
  whereParts.push(...hier.whereParts);
  params.push(...hier.params);

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

  // Per Tipe Dana (segment) breakdown
  type SegRow = {
    branch_id: number;
    branch_name: string;
    segment_id: number;
    segment_name: string;
    currency: string;
    total_in: string;
    total_out: string;
    tx_count: number;
  };
  const bySegment = await query<SegRow>(
    `SELECT b.id AS branch_id, b.name AS branch_name,
            s.id AS segment_id, s.name AS segment_name,
            t.currency,
            COALESCE(SUM(t.credit), 0)::TEXT AS total_in,
            COALESCE(SUM(t.debit), 0)::TEXT AS total_out,
            COUNT(*)::INT AS tx_count
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN sub_segments ss ON ss.id = a.sub_segment_id
       JOIN segments s ON s.id = ss.segment_id
       JOIN branches b ON b.id = t.branch_id
      WHERE ${whereSql}
      GROUP BY b.id, b.name, s.id, s.name, t.currency
      ORDER BY b.name, s.display_order, s.name`,
    params
  );

  // Buat line chart data per currency
  const currencies = Array.from(new Set(daily.map((d) => d.currency))).sort();

  // Helper preserve QS waktu klik tab rekening
  const preserveQS = (overrides: Record<string, string | number | null>) => {
    const qs = new URLSearchParams();
    qs.set("from", period.from);
    qs.set("to", period.to);
    if (session.role === "global" && filterBranchId) qs.set("branch_id", String(filterBranchId));
    if (filterSegmentId) qs.set("segment_id", String(filterSegmentId));
    if (filterSubId) qs.set("sub_id", String(filterSubId));
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === null || v === undefined || v === "") qs.delete(k);
      else qs.set(k, String(v));
    });
    return `/laporan?${qs}`;
  };

  return (
    <>
      <Topbar
        title="Laporan Keuangan"
        role={session.role}
        subtitle={`Periode ${formatDate(period.from)} — ${formatDate(period.to)}`}
      />

      {/* Filter bar — cascade */}
      <div className="card mb-4">
        <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-3">
          Filter Lokasi Dana + Periode
        </div>
        <form className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          {session.role === "global" && (
            <div>
              <label className="form-label">Cabang</label>
              <select name="branch_id" className="form-select" defaultValue={filterBranchId ?? ""}>
                <option value="">— Semua (Konsolidasi) —</option>
                {cascade.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">Tipe Dana</label>
            <select name="segment_id" className="form-select" defaultValue={filterSegmentId ?? ""}>
              <option value="">— Semua —</option>
              {cascade.segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {!filterBranchId && session.role === "global" ? (
              <p className="text-[10px] text-ink-3 mt-1">Pilih cabang dulu untuk filter</p>
            ) : cascade.segments.length === 0 ? (
              <p className="text-[10px] text-bad-2 mt-1">
                Cabang belum punya Tipe Dana.{" "}
                <Link href={`/cabang/${filterBranchId}`} className="underline">
                  Tambah →
                </Link>
              </p>
            ) : null}
          </div>
          <div>
            <label className="form-label">Sub Tipe Dana</label>
            <select name="sub_id" className="form-select" defaultValue={filterSubId ?? ""}>
              <option value="">— Semua —</option>
              {cascade.subs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {!filterSegmentId ? (
              <p className="text-[10px] text-ink-3 mt-1">Pilih Tipe Dana dulu</p>
            ) : cascade.subs.length === 0 ? (
              <p className="text-[10px] text-bad-2 mt-1">
                Tipe Dana ini belum punya Sub Tipe Dana.{" "}
                <Link
                  href={`/cabang/${filterBranchId}/tipe-dana/${filterSegmentId}`}
                  className="underline"
                >
                  Tambah →
                </Link>
              </p>
            ) : null}
          </div>
          <div></div>
          <div>
            <label className="form-label">Dari</label>
            <input type="date" name="from" className="form-input" defaultValue={period.from} />
          </div>
          <div>
            <label className="form-label">Sampai</label>
            <input type="date" name="to" className="form-input" defaultValue={period.to} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Link href="/laporan" className="btn btn-outline">Reset</Link>
            <button type="submit" className="btn btn-primary">Terapkan Filter</button>
          </div>
        </form>
      </div>

      {/* Tab rekening (kalau cabang dipilih) */}
      {filterBranchId && cascade.accounts.length > 0 && (
        <div className="card mb-4">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
            Rekening — pilih untuk drill-down
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={preserveQS({ account_id: null })}
              className={!filterAccountId ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            >
              Semua Rekening
            </Link>
            {cascade.accounts.map((a) => {
              const last4 = a.account_number.slice(-4);
              return (
                <Link
                  key={a.id}
                  href={preserveQS({ account_id: a.id })}
                  className={filterAccountId === a.id ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
                >
                  {a.bank} — {last4} · {a.purpose}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Cascade hierarchy: change parent → reset children + auto-submit form
            ['branch_id', 'segment_id', 'sub_id'].forEach(function (parent, i) {
              const sel = document.querySelector('select[name="' + parent + '"]');
              if (!sel) return;
              sel.addEventListener('change', function () {
                const children = ['segment_id', 'sub_id'].slice(i);
                children.forEach(function (cname) {
                  const c = document.querySelector('select[name="' + cname + '"]');
                  if (c) c.value = '';
                });
                if (sel.form) sel.form.requestSubmit();
              });
            });
          `,
        }}
      />

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
              {/* Header gradient — brand dark dengan tint orange */}
              <div className="rounded-2xl p-7 mb-4 text-white relative overflow-hidden"
                   style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 70%, #2a1208 100%)" }}>
                <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-brand-orange/15 blur-2xl" />
                <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full bg-brand-yellow/10 blur-3xl" />
                <div className="relative">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-brand-yellow mb-1 font-semibold">
                    Laporan Keuangan · {s.currency}
                  </div>
                  <h2 className="font-serif text-2xl font-light mb-0.5">
                    {filterBranchId
                      ? cascade.branches.find((b) => b.id === filterBranchId)?.name ?? "Cabang"
                      : "Konsolidasi Semua Cabang"}
                  </h2>
                  <div className="text-[12px] text-white/55 mb-4">
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
                      <div className="text-[20px] font-bold text-brand-yellow">{s.tx_count}</div>
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

              {/* Per Tipe Dana untuk currency ini */}
              {(() => {
                const segRowsForCur = bySegment.filter((sg) => sg.currency === s.currency);
                if (segRowsForCur.length === 0) return null;
                return (
                  <div className="card mt-4">
                    <h3 className="font-semibold text-[13px] mb-3">
                      Rincian per Tipe Dana ({s.currency})
                    </h3>
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-line">
                          {!filterBranchId && (
                            <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Cabang</th>
                          )}
                          <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Tipe Dana</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Trx</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Pemasukan</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Pengeluaran</th>
                          <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Net</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {segRowsForCur.map((sg) => {
                          const segIn = parseFloat(sg.total_in);
                          const segOut = parseFloat(sg.total_out);
                          const segNet = segIn - segOut;
                          return (
                            <tr key={`${sg.branch_id}-${sg.segment_id}`} className="border-b border-line hover:bg-cream">
                              {!filterBranchId && (
                                <td className="py-2 px-2 text-[11px] text-ink-2">{sg.branch_name}</td>
                              )}
                              <td className="py-2 px-2 font-medium">{sg.segment_name}</td>
                              <td className="py-2 px-2 text-right text-ink-2">{sg.tx_count}</td>
                              <td className="py-2 px-2 text-right text-good">
                                {segIn > 0 ? formatMoney(segIn, s.currency) : "—"}
                              </td>
                              <td className="py-2 px-2 text-right text-bad-2">
                                {segOut > 0 ? formatMoney(segOut, s.currency) : "—"}
                              </td>
                              <td className={`py-2 px-2 text-right font-semibold ${
                                segNet >= 0 ? "text-good" : "text-bad-2"
                              }`}>
                                {segNet >= 0 ? "+" : ""}{formatMoney(segNet, s.currency)}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <Link
                                  href={preserveQS({
                                    branch_id: sg.branch_id,
                                    segment_id: sg.segment_id,
                                  })}
                                  className="btn btn-outline btn-sm"
                                >
                                  Drill-down
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          );
        })
      )}
    </>
  );
}
