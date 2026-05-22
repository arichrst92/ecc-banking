import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import type { Category } from "@/lib/types";
import { recategorizeAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Branch = { id: number; name: string };
type Account = { id: number; bank: string; account_number: string; purpose: string };

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
  branch_name: string;
};

export default async function TransaksiPage({
  searchParams,
}: {
  searchParams: {
    branch_id?: string;
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

  // Filter
  const filterBranchId = session.role === "branch"
    ? session.branchId
    : (searchParams.branch_id ? Number(searchParams.branch_id) : null);
  const filterAccountId = searchParams.account_id ? Number(searchParams.account_id) : null;
  const filterCategoryId = searchParams.category_id ? Number(searchParams.category_id) : null;
  const filterDirection = searchParams.direction === "in" || searchParams.direction === "out"
    ? searchParams.direction
    : null;
  const filterFrom = searchParams.from ?? null;
  const filterTo = searchParams.to ?? null;
  const filterQ = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page ?? 1));

  // Build WHERE
  const whereParts: string[] = [`t.archived_at IS NULL`];
  const params: unknown[] = [];
  if (filterBranchId) {
    params.push(filterBranchId);
    whereParts.push(`t.branch_id = $${params.length}`);
  }
  if (filterAccountId) {
    params.push(filterAccountId);
    whereParts.push(`t.account_id = $${params.length}`);
  }
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
            a.bank, a.account_number,
            b.name AS branch_name
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       JOIN accounts a ON a.id = t.account_id
       JOIN branches b ON b.id = t.branch_id
      WHERE ${whereSql}
      ORDER BY t.tx_date DESC, t.id DESC
      LIMIT $${offsetParams.length - 1} OFFSET $${offsetParams.length}`,
    offsetParams
  );

  // Untuk filter dropdowns
  const branches = await query<Branch>(
    session.role === "branch"
      ? `SELECT id, name FROM branches WHERE id = $1`
      : `SELECT id, name FROM branches WHERE status='aktif' ORDER BY name`,
    session.role === "branch" ? [session.branchId] : []
  );

  const accounts = filterBranchId
    ? await query<Account>(
        `SELECT id, bank, account_number, purpose FROM accounts WHERE branch_id = $1 ORDER BY bank`,
        [filterBranchId]
      )
    : [];

  const categories = await query<Category>(
    `SELECT * FROM categories ORDER BY priority ASC, name ASC`
  );

  // Build URL helper untuk pagination
  const qsBase = new URLSearchParams();
  if (filterBranchId && session.role === "global") qsBase.set("branch_id", String(filterBranchId));
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

      {/* Filter */}
      <div className="card mb-4">
        <form className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          {session.role === "global" && (
            <div>
              <label className="form-label">Cabang</label>
              <select name="branch_id" className="form-select" defaultValue={filterBranchId ?? ""}>
                <option value="">— Semua —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">Rekening</label>
            <select name="account_id" className="form-select" defaultValue={filterAccountId ?? ""}>
              <option value="">— Semua —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank} {a.account_number.slice(-4)} · {a.purpose}
                </option>
              ))}
            </select>
          </div>
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
          <div className="md:col-span-2">
            <label className="form-label">Cari Keterangan</label>
            <input type="search" name="q" className="form-input" defaultValue={filterQ} placeholder="kata kunci..." />
          </div>
          <div className="col-span-2 md:col-span-4 flex justify-end gap-2">
            <Link href="/transaksi" className="btn btn-outline">Reset</Link>
            <button type="submit" className="btn btn-primary">Terapkan Filter</button>
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
                  {session.role === "global" && (
                    <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Cabang</th>
                  )}
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Rekening</th>
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Keterangan</th>
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kategori</th>
                  <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Debit</th>
                  <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-b border-line hover:bg-cream">
                    <td className="py-2 px-2 whitespace-nowrap text-ink-3">
                      {formatDate(t.tx_date)}
                    </td>
                    {session.role === "global" && (
                      <td className="py-2 px-2 text-[11px] text-ink-2">{t.branch_name}</td>
                    )}
                    <td className="py-2 px-2 text-[11px] text-ink-2">
                      {t.bank} {t.account_number.slice(-4)}
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
                          className="text-[11px] px-2 py-1 rounded border border-line bg-white focus:outline-none focus:border-navy-3"
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

      {/* Auto-submit script untuk select kategori */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.querySelectorAll('[data-auto-submit]').forEach(function (sel) {
              sel.addEventListener('change', function () {
                if (sel.form) sel.form.requestSubmit();
              });
            });
          `,
        }}
      />
    </>
  );
}
