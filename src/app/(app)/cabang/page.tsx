import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { formatMoney, formatDateTime } from "@/lib/format";
import { LoadingButton } from "@/components/loading-button";
import { createBranchAction, updateBranchAction, deleteBranchAction } from "./actions";

export const dynamic = "force-dynamic";

type BranchRow = {
  id: number;
  name: string;
  code: string;
  pic_name: string;
  pic_phone: string | null;
  status: "aktif" | "nonaktif" | "review";
  notes: string | null;
  segment_count: number;
  sub_count: number;
  account_count: number;
  // Saldo agg per currency
  saldo_summary: Array<{ currency: string; total: string; accounts: number }>;
  // Activity
  last_upload_at: string | null;
  upload_count_30d: number;
  tx_count_30d: number;
  // Per Tipe Dana brief
  tipe_dana_chips: Array<{ name: string; account_count: number }>;
};

export default async function CabangPage({
  searchParams,
}: {
  searchParams: { show?: string; edit?: string; err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const branches = await query<BranchRow>(
    `SELECT b.*,
            COALESCE((SELECT COUNT(*)::INT FROM segments s WHERE s.branch_id = b.id), 0) AS segment_count,
            COALESCE((SELECT COUNT(*)::INT FROM sub_segments ss
                       JOIN segments s ON s.id = ss.segment_id
                       WHERE s.branch_id = b.id), 0) AS sub_count,
            COALESCE((SELECT COUNT(*)::INT FROM accounts a WHERE a.branch_id = b.id), 0) AS account_count,
            COALESCE((
              SELECT json_agg(json_build_object(
                'currency', s.currency,
                'total', s.total::TEXT,
                'accounts', s.accounts
              ) ORDER BY s.currency)
              FROM (
                SELECT a.currency, SUM(a.current_balance) AS total, COUNT(*)::INT AS accounts
                  FROM accounts a
                 WHERE a.branch_id = b.id AND a.status = 'aktif'
                 GROUP BY a.currency
              ) s
            ), '[]'::json) AS saldo_summary,
            (SELECT MAX(uploaded_at) FROM uploads u WHERE u.branch_id = b.id) AS last_upload_at,
            COALESCE((SELECT COUNT(*)::INT FROM uploads u
                       WHERE u.branch_id = b.id
                         AND u.status = 'success'
                         AND u.uploaded_at > NOW() - INTERVAL '30 days'), 0) AS upload_count_30d,
            COALESCE((SELECT COUNT(*)::INT FROM transactions t
                       WHERE t.branch_id = b.id
                         AND t.created_at > NOW() - INTERVAL '30 days'
                         AND t.archived_at IS NULL), 0) AS tx_count_30d,
            COALESCE((
              SELECT json_agg(json_build_object(
                'name', x.segment_name,
                'account_count', x.account_count
              ) ORDER BY x.segment_name)
              FROM (
                SELECT s.name AS segment_name,
                       COUNT(DISTINCT a.id)::INT AS account_count
                  FROM segments s
                  LEFT JOIN sub_segments ss ON ss.segment_id = s.id
                  LEFT JOIN accounts a ON a.sub_segment_id = ss.id
                 WHERE s.branch_id = b.id AND s.status = 'aktif'
                 GROUP BY s.id, s.name
              ) x
            ), '[]'::json) AS tipe_dana_chips
       FROM branches b
       ORDER BY b.status, b.name`
  );

  const showForm = searchParams.show === "form" || !!searchParams.edit;
  const editing = searchParams.edit
    ? branches.find((b) => b.id === Number(searchParams.edit))
    : null;
  const isEdit = !!editing;

  // Top stats
  const totalCabang = branches.length;
  const cabangAktif = branches.filter((b) => b.status === "aktif").length;
  const totalRekening = branches.reduce((s, b) => s + b.account_count, 0);
  const totalSaldoByCurrency: Record<string, number> = {};
  for (const b of branches) {
    for (const s of b.saldo_summary) {
      const cur = s.currency || "IDR";
      totalSaldoByCurrency[cur] = (totalSaldoByCurrency[cur] ?? 0) + parseFloat(s.total);
    }
  }

  return (
    <>
      <Topbar
        title="Kelola Cabang"
        role={session.role}
        subtitle={`${totalCabang} cabang · ${cabangAktif} aktif · ${totalRekening} rekening terdaftar`}
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

      {/* Top summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">CABANG AKTIF</div>
          <div className="text-[22px] font-bold leading-none text-brand-orange">
            {cabangAktif}<span className="text-[14px] text-ink-3 font-normal"> / {totalCabang}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">TOTAL REKENING</div>
          <div className="text-[22px] font-bold leading-none">{totalRekening}</div>
          <div className="text-[10px] text-ink-3 mt-1">
            di {branches.reduce((s, b) => s + b.sub_count, 0)} Sub Tipe Dana
          </div>
        </div>
        <div className="stat-card md:col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">TOTAL SALDO KONSOLIDASI</div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(totalSaldoByCurrency).length === 0 ? (
              <span className="text-ink-3 text-[14px]">—</span>
            ) : (
              Object.entries(totalSaldoByCurrency).map(([cur, total]) => (
                <div key={cur}>
                  <div className="text-[11px] text-ink-3 font-mono">{cur}</div>
                  <div className="text-[18px] font-bold leading-none">{formatMoney(total, cur)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {!showForm && (
        <div className="mb-4 flex justify-end">
          <Link href="/cabang?show=form" className="btn btn-gold">+ Tambah Cabang</Link>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[14px]">
              {isEdit ? `Edit Cabang — ${editing!.name}` : "Tambah Cabang Baru"}
            </h2>
            <Link href="/cabang" className="btn btn-outline btn-sm">Batal</Link>
          </div>

          <form
            action={isEdit ? updateBranchAction.bind(null, editing!.id) : createBranchAction}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <div className="md:col-span-2">
              <label className="form-label">Nama Cabang</label>
              <input name="name" className="form-input" defaultValue={editing?.name ?? ""} placeholder="Mis. Jemaat Jakarta Pusat" required />
            </div>
            <div>
              <label className="form-label">Kode Cabang</label>
              <input name="code" className="form-input uppercase" defaultValue={editing?.code ?? ""} placeholder="Mis. JKT-P" pattern="[A-Za-z0-9\-]{2,16}" required />
              <p className="text-[10px] text-ink-3 mt-1">Huruf, angka, strip. Maks 16 karakter.</p>
            </div>
            <div>
              <label className="form-label">Status</label>
              <select name="status" className="form-select" defaultValue={editing?.status ?? "aktif"}>
                <option value="aktif">Aktif</option>
                <option value="review">Review</option>
                <option value="nonaktif">Non-aktif</option>
              </select>
            </div>
            <div>
              <label className="form-label">Nama PIC</label>
              <input name="pic_name" className="form-input" defaultValue={editing?.pic_name ?? ""} placeholder="Mis. Pdt. Andreas Santoso" required />
            </div>
            <div>
              <label className="form-label">No. WhatsApp PIC</label>
              <input name="pic_phone" className="form-input" defaultValue={editing?.pic_phone ?? ""} placeholder="Mis. +6281234567890" />
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Catatan (opsional)</label>
              <textarea name="notes" className="form-textarea" rows={2} defaultValue={editing?.notes ?? ""} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Link href="/cabang" className="btn btn-outline">Batal</Link>
              <LoadingButton variant="primary" loadingText="Menyimpan...">
                {isEdit ? "Simpan Perubahan" : "Tambah Cabang"}
              </LoadingButton>
            </div>
          </form>

          {!isEdit && (
            <p className="text-[11px] text-ink-3 mt-3">
              💡 Setelah cabang ditambahkan, kode akses 8-digit akan otomatis di-create dengan placeholder.
              Jangan lupa <Link href="/kode-akses" className="text-info underline">set kode akses</Link> sebelum dipakai bendahara.
            </p>
          )}
        </div>
      )}

      {/* Branch rich cards */}
      <div className="space-y-4">
        {branches.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-[14px] text-ink-3 mb-2">Belum ada cabang terdaftar.</p>
            <Link href="/cabang?show=form" className="btn btn-gold inline-flex">
              + Tambah Cabang Pertama
            </Link>
          </div>
        )}
        {branches.map((b) => {
          const statusClass =
            b.status === "aktif" ? "chip-green" : b.status === "review" ? "chip-amber" : "chip-gray";
          const isInactive = b.status === "nonaktif";

          return (
            <div
              key={b.id}
              className={`card ${isInactive ? "opacity-70" : ""} border-l-4 ${
                b.status === "aktif"
                  ? "border-l-good"
                  : b.status === "review"
                  ? "border-l-[#f5d98a]"
                  : "border-l-ink-3"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-serif text-[18px] font-semibold text-navy">{b.name}</h3>
                    <span className="font-mono text-[11px] text-ink-3 bg-cream-2 px-1.5 py-0.5 rounded">
                      {b.code}
                    </span>
                    <span className={`chip ${statusClass}`}>{b.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[12px] text-ink-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-ink-3">👤</span>
                      {b.pic_name}
                    </span>
                    {b.pic_phone && (
                      <a
                        href={`https://wa.me/${b.pic_phone.replace(/[^\d]/g, "")}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-good hover:underline"
                      >
                        <span>📱</span>
                        {b.pic_phone}
                      </a>
                    )}
                  </div>
                  {b.notes && (
                    <p className="text-[11px] text-ink-3 italic mt-1.5">📝 {b.notes}</p>
                  )}
                </div>

                <div className="flex gap-1.5 shrink-0">
                  <Link href={`/cabang/${b.id}`} className="btn btn-primary btn-sm">
                    Kelola Struktur →
                  </Link>
                  <Link href={`/cabang?edit=${b.id}`} className="btn btn-outline btn-sm">
                    Edit
                  </Link>
                  <form action={deleteBranchAction.bind(null, b.id)} className="inline">
                    <LoadingButton
                      variant="danger"
                      size="sm"
                      loadingText="..."
                      confirm={`Hapus cabang "${b.name}"?\n\nAksi ini DIBLOCK kalau masih ada rekening. Hapus rekening + Sub Tipe Dana + Tipe Dana dulu kalau ingin lanjut.`}
                    >
                      Hapus
                    </LoadingButton>
                  </form>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-cream-2 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">Tipe Dana</div>
                  <div className="text-[20px] font-bold text-navy">{b.segment_count}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5">
                    {b.sub_count} Sub · {b.account_count} Rek
                  </div>
                </div>
                <div className="bg-cream-2 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">Upload 30 Hari</div>
                  <div className="text-[20px] font-bold text-navy">{b.upload_count_30d}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5">
                    {b.tx_count_30d} transaksi tercatat
                  </div>
                </div>
                <div className="bg-cream-2 rounded-lg p-3 md:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium mb-1">
                    Saldo Konsolidasi
                  </div>
                  {b.saldo_summary.length === 0 ? (
                    <div className="text-[13px] text-ink-3 italic">Belum ada rekening</div>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {b.saldo_summary.map((s) => (
                        <div key={s.currency}>
                          <span className="text-[10px] text-ink-3 font-mono mr-1">{s.currency}</span>
                          <span className="text-[15px] font-semibold">
                            {formatMoney(s.total, s.currency)}
                          </span>
                          <span className="text-[10px] text-ink-3 ml-1">
                            ({s.accounts} rek)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tipe Dana chips */}
              {b.tipe_dana_chips.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium mb-1.5">
                    Tipe Dana Terdaftar
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {b.tipe_dana_chips.map((td) => (
                      <Link
                        key={td.name}
                        href={`/cabang/${b.id}`}
                        className="inline-flex items-center gap-1.5 bg-brand-orange-soft text-brand-orange px-2.5 py-1 rounded-full text-[11px] font-medium hover:bg-brand-orange/15 transition-colors"
                      >
                        <span>📌</span>
                        <span>{td.name}</span>
                        <span className="text-ink-3 font-normal">· {td.account_count} rek</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Last activity */}
              {b.last_upload_at && (
                <div className="mt-3 pt-3 border-t border-line text-[10px] text-ink-3">
                  Upload terakhir: <span className="font-medium">{formatDateTime(b.last_upload_at)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
