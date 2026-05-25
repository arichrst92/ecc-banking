import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getCascadeOptions, buildTxWhere } from "@/lib/hierarchy";
import type { Category } from "@/lib/types";
import { recategorizeAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type TxRow = {
  id: number;
  tx_date: string;
  description: string;
  bank_branch_code: string | null;
  debit: string;
  credit: string;
  balance: string | null;
  direction: "in" | "out";
  currency: string;
  category_id: number;
  category_name: string;
  category_color: string;
  is_anomaly: boolean;
  anomaly_reasons: string[];
  note: string | null;
  bank: string;
  account_number: string;
  account_purpose: string;
  branch_name: string;
  branch_code: string;
  segment_name: string;
  sub_name: string;
};

export default async function TransaksiPage({
  searchParams,
}: {
  searchParams: {
    branch_id?: string;
    segment_id?: string;
    sub_id?: string;
    account_id?: string;
    category_id?: string;
    direction?: string;
    from?: string;
    to?: string;
    q?: string;
    page?: string;
    err?: string;
    msg?: string;
  };
}) {
  const session = getSession()!;

  // Cascade filters
  const filterBranchId = session.role === "branch"
    ? session.branchId!
    : (searchParams.branch_id ? Number(searchParams.branch_id) : null);
  const filterSegmentId = searchParams.segment_id ? Number(searchParams.segment_id) : null;
  const filterSubId = searchParams.sub_id ? Number(searchParams.sub_id) : null;
  const filterAccountId = searchParams.account_id ? Number(searchParams.account_id) : null;
  const filterCategoryId = searchParams.category_id ? Number(searchParams.category_id) : null;
  const filterDirection = searchParams.direction === "in" || searchParams.direction === "out"
    ? searchParams.direction : null;
  const filterFrom = searchParams.from ?? null;
  const filterTo = searchParams.to ?? null;
  const filterQ = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page ?? 1));

  // Load cascade options
  const cascade = await getCascadeOptions(
    { branchId: filterBranchId, segmentId: filterSegmentId, subId: filterSubId },
    session.role,
    session.branchId
  );

  // Build WHERE
  const whereParts: string[] = [`t.archived_at IS NULL`];
  const params: unknown[] = [];

  const hier = buildTxWhere(
    { branchId: filterBranchId ?? undefined, segmentId: filterSegmentId ?? undefined,
      subId: filterSubId ?? undefined, accountId: filterAccountId ?? undefined },
    params.length + 1
  );
  whereParts.push(...hier.whereParts);
  params.push(...hier.params);

  if (filterCategoryId) {
    params.push(filterCategoryId);
    whereParts.push(`t.category_id = $${params.length}`);
  }
  if (filterDirection) {
    params.push(filterDirection);
    whereParts.push(`t.direction = $${params.length}`);
  }
  if (filterFrom) {
    params.push(filterFrom);
    whereParts.push(`t.tx_date >= $${params.length}`);
  }
  if (filterTo) {
    params.push(filterTo);
    whereParts.push(`t.tx_date <= $${params.length}`);
  }
  if (filterQ) {
    params.push(`%${filterQ.toUpperCase()}%`);
    whereParts.push(`t.description_normalized LIKE $${params.length}`);
  }
  const whereSql = whereParts.join(" AND ");

  // Count
  const total = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM transactions t WHERE ${whereSql}`,
    params
  );
  const totalCount = Number(total?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Data
  const offsetParams = [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE];
  const txs = await query<TxRow>(
    `SELECT t.id, t.tx_date::TEXT AS tx_date, t.description, t.bank_branch_code,
            t.debit::TEXT, t.credit::TEXT, t.balance::TEXT, t.direction, t.currency,
            t.category_id, t.is_anomaly, t.anomaly_reasons, t.note,
            c.name AS category_name, c.color AS category_color,
            a.bank, a.account_number, a.purpose AS account_purpose,
            b.name AS branch_name, b.code AS branch_code,
            s.name AS segment_name, ss.name AS sub_name
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       JOIN accounts a ON a.id = t.account_id
       JOIN sub_segments ss ON ss.id = a.sub_segment_id
       JOIN segments s ON s.id = ss.segment_id
       JOIN branches b ON b.id = t.branch_id
      WHERE ${whereSql}
      ORDER BY t.tx_date DESC, t.id DESC
      LIMIT $${offsetParams.length - 1} OFFSET $${offsetParams.length}`,
    offsetParams
  );

  const categories = await query<Category>(
    `SELECT * FROM categories ORDER BY priority ASC, name ASC`
  );

  // Pagination QS helper
  const qsBase = new URLSearchParams();
  if (session.role === "global" && filterBranchId) qsBase.set("branch_id", String(filterBranchId));
  if (filterSegmentId) qsBase.set("segment_id", String(filterSegmentId));
  if (filterSubId) qsBase.set("sub_id", String(filterSubId));
  if (filterAccountId) qsBase.set("account_id", String(filterAccountId));
  if (filterCategoryId) qsBase.set("category_id", String(filterCategoryId));
  if (filterDirection) qsBase.set("direction", filterDirection);
  if (filterFrom) qsBase.set("from", filterFrom);
  if (filterTo) qsBase.set("to", filterTo);
  if (filterQ) qsBase.set("q", filterQ);

  const pageUrl = (p: number) => {
    const qs = new URLSearchParams(qsBase);
    qs.set("page", String(p));
    return `/transaksi?${qs}`;
  };

  return (
    <>
      <Topbar
        title="Transaksi"
        role={session.role}
        subtitle={`${totalCount} transaksi · halaman ${page} dari ${totalPages}`}
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

      {/* Filter — cascade */}
      <div className="card mb-4">
        <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-3">
          Filter Lokasi Dana
        </div>
        <form className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {session.role === "global" && (
            <div>
              <label className="form-label">Cabang</label>
              <select name="branch_id" className="form-select" defaultValue={filterBranchId ?? ""}>
                <option value="">— Semua —</option>
                {cascade.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">Tipe Dana</label>
            <select name="segment_id" className="form-select" defaultValue={filterSegmentId ?? ""}
              disabled={!filterBranchId && cascade.segments.length === 0}>
              <option value="">— Semua —</option>
              {cascade.segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {!filterBranchId && session.role === "global" && (
              <p className="text-[10px] text-ink-3 mt-1">Pilih cabang dulu</p>
            )}
          </div>
          <div>
            <label className="form-label">Sub Tipe Dana</label>
            <select name="sub_id" className="form-select" defaultValue={filterSubId ?? ""}
              disabled={!filterSegmentId}>
              <option value="">— Semua —</option>
              {cascade.subs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {!filterSegmentId && (
              <p className="text-[10px] text-ink-3 mt-1">Pilih Tipe Dana dulu</p>
            )}
          </div>
          <div>
            <label className="form-label">Rekening</label>
            <select name="account_id" className="form-select" defaultValue={filterAccountId ?? ""}>
              <option value="">— Semua —</option>
              {cascade.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank} {a.account_number.slice(-4)} · {a.purpose}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 md:col-span-4 border-t border-line pt-3 -mt-1">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
              Filter Atribut
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="form-label">Kategori</label>
                <select name="category_id" className="form-select" defaultValue={filterCategoryId ?? ""}>
                  <option value="">— Semua —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Arah</label>
                <select name="direction" className="form-select" defaultValue={filterDirection ?? ""}>
                  <option value="">— Semua —</option>
                  <option value="in">Masuk</option>
                  <option value="out">Keluar</option>
                </select>
              </div>
              <div>
                <label className="form-label">Dari</label>
                <input type="date" name="from" className="form-input" defaultValue={filterFrom ?? ""} />
              </div>
              <div>
                <label className="form-label">Sampai</label>
                <input type="date" name="to" className="form-input" defaultValue={filterTo ?? ""} />
              </div>
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="form-label">Cari Keterangan</label>
            <input type="search" name="q" className="form-input" defaultValue={filterQ} placeholder="kata kunci..." />
          </div>
          <div className="flex items-end gap-2 justify-end">
            <Link href="/transaksi" className="btn btn-outline">Reset</Link>
            <button type="submit" className="btn btn-primary">Terapkan</button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="card">
        {txs.length === 0 ? (
          <p className="text-[12px] text-ink-3 text-center py-8">Tidak ada transaksi sesuai filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Tanggal</th>
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Path Akun</th>
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Keterangan</th>
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kategori</th>
                  <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Debit</th>
                  <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-b border-line hover:bg-cream">
                    <td className="py-2 px-2 whitespace-nowrap text-ink-3">{formatDate(t.tx_date)}</td>
                    <td className="py-2 px-2 text-[11px] max-w-[200px]">
                      {session.role === "global" && (
                        <div className="font-medium text-ink">{t.branch_code}</div>
                      )}
                      <div className="text-ink-2 leading-tight">
                        <span className="text-ink-3">›</span> {t.segment_name}
                      </div>
                      <div className="text-ink-2 leading-tight">
                        <span className="text-ink-3">›</span> {t.sub_name}
                      </div>
                      <div className="text-ink-2 leading-tight font-medium">
                        <span className="text-ink-3">›</span> {t.bank} {t.account_number.slice(-4)}
                      </div>
                      <div className="text-[10px] text-ink-3 italic">{t.account_purpose}</div>
                    </td>
                    <td className="py-2 px-2 max-w-md">
                      <div className="line-clamp-2" title={t.description}>{t.description}</div>
                      {t.note && (
                        <div className="text-[10px] text-info italic mt-0.5">📝 {t.note}</div>
                      )}
                      {t.is_anomaly && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {t.anomaly_reasons.map((r) => (
                            <span key={r} className="chip chip-amber">⚠ {r}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <form action={recategorizeAction.bind(null, t.id)} className="inline">
                        <select
                          name="category_id"
                          defaultValue={t.category_id}
                          data-auto-submit
                          className="text-[11px] px-2 py-1 rounded border border-line bg-white focus:outline-none focus:border-brand-orange"
                          style={{ borderLeft: `4px solid ${t.category_color}` }}
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </form>
                    </td>
                    <td className="py-2 px-2 text-right text-bad-2 whitespace-nowrap">
                      {parseFloat(t.debit) > 0 ? formatMoney(t.debit, t.currency) : ""}
                    </td>
                    <td className="py-2 px-2 text-right text-good whitespace-nowrap">
                      {parseFloat(t.credit) > 0 ? formatMoney(t.credit, t.currency) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-[12px]">
            <div className="text-ink-3">
              Halaman {page} dari {totalPages} · {totalCount} total
            </div>
            <div className="flex gap-1">
              {page > 1 && (
                <Link href={pageUrl(page - 1)} className="btn btn-outline btn-sm">← Prev</Link>
              )}
              {page < totalPages && (
                <Link href={pageUrl(page + 1)} className="btn btn-outline btn-sm">Next →</Link>
              )}
            </div>
          </div>
        )}
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Auto-submit untuk select dropdown re-categorize per row
            document.querySelectorAll('[data-auto-submit]').forEach(function (sel) {
              sel.addEventListener('change', function () {
                if (sel.form) sel.form.requestSubmit();
              });
            });
            // Cascade hierarchy: change parent → reset children + auto-submit form
            ['branch_id', 'segment_id', 'sub_id', 'account_id'].forEach(function (parent, i) {
              const sel = document.querySelector('select[name="' + parent + '"]');
              if (!sel) return;
              sel.addEventListener('change', function () {
                // Reset child filters dulu
                const children = ['segment_id', 'sub_id', 'account_id'].slice(i);
                children.forEach(function (cname) {
                  const c = document.querySelector('select[name="' + cname + '"]');
                  if (c) c.value = '';
                });
                // Auto-submit form supaya child dropdown bisa populate
                if (sel.form) sel.form.requestSubmit();
              });
            });
          `,
        }}
      />
    </>
  );
}
