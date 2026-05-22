import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import type { Account, Branch, Segment, SubSegment } from "@/lib/types";
import { formatMoney, formatDateTime } from "@/lib/format";
import { createAccountAction, updateAccountAction, deleteAccountAction } from "./actions";

export const dynamic = "force-dynamic";

const BANK_OPTIONS = ["BCA", "Mandiri", "BNI", "BRI", "CIMB Niaga", "Danamon", "BTN", "Permata"];
const CURRENCY_PRESET = ["IDR", "USD", "SGD", "EUR", "MYR", "GBP", "JPY", "AUD"];

export default async function SubTipeDanaDetailPage({
  params,
  searchParams,
}: {
  params: { id: string; segId: string; subId: string };
  searchParams: { show?: string; edit?: string; err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const branchId = Number(params.id);
  const segmentId = Number(params.segId);
  const subId = Number(params.subId);
  if (isNaN(branchId) || isNaN(segmentId) || isNaN(subId)) notFound();

  const branch = await queryOne<Branch>(`SELECT * FROM branches WHERE id = $1`, [branchId]);
  if (!branch) notFound();

  const segment = await queryOne<Segment>(
    `SELECT * FROM segments WHERE id = $1 AND branch_id = $2`, [segmentId, branchId]
  );
  if (!segment) notFound();

  const sub = await queryOne<SubSegment>(
    `SELECT * FROM sub_segments WHERE id = $1 AND segment_id = $2`, [subId, segmentId]
  );
  if (!sub) notFound();

  const accounts = await query<Account>(
    `SELECT * FROM accounts WHERE sub_segment_id = $1 ORDER BY status DESC, bank, account_number`,
    [subId]
  );

  const showForm = searchParams.show === "form" || !!searchParams.edit;
  const editing = searchParams.edit
    ? accounts.find((a) => a.id === Number(searchParams.edit))
    : null;
  const isEdit = !!editing;

  return (
    <>
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href="/cabang" className="hover:text-navy">Cabang</Link>
        <span className="mx-1">›</span>
        <Link href={`/cabang/${branchId}`} className="hover:text-navy">{branch.name}</Link>
        <span className="mx-1">›</span>
        <Link href={`/cabang/${branchId}/tipe-dana/${segmentId}`} className="hover:text-navy">{segment.name}</Link>
        <span className="mx-1">›</span>
        <span className="text-navy font-medium">{sub.name}</span>
      </div>

      <Topbar
        title={`Rekening — ${sub.name}`}
        role={session.role}
        subtitle={`${branch.name} · ${segment.name} · ${sub.name}`}
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

      {!showForm && (
        <div className="mb-4 flex justify-end">
          <Link
            href={`/cabang/${branchId}/tipe-dana/${segmentId}/sub/${subId}?show=form`}
            className="btn btn-gold"
          >
            + Tambah Rekening
          </Link>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[14px]">
              {isEdit
                ? `Edit Rekening — ${editing!.bank} ${editing!.account_number}`
                : "Tambah Rekening Baru"}
            </h2>
            <Link
              href={`/cabang/${branchId}/tipe-dana/${segmentId}/sub/${subId}`}
              className="btn btn-outline btn-sm"
            >
              Batal
            </Link>
          </div>

          <form
            action={
              isEdit
                ? updateAccountAction.bind(null, branchId, segmentId, subId, editing!.id)
                : createAccountAction.bind(null, branchId, segmentId, subId)
            }
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <div>
              <label className="form-label">Bank</label>
              <input
                name="bank"
                className="form-input"
                list="bank-list"
                defaultValue={editing?.bank ?? "BCA"}
                placeholder="Mis. BCA"
                required
              />
              <datalist id="bank-list">
                {BANK_OPTIONS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="form-label">Nomor Rekening</label>
              <input
                name="account_number"
                className="form-input"
                defaultValue={editing?.account_number ?? ""}
                placeholder="Tanpa spasi/strip"
                pattern="\d{5,30}"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="form-label">Nama Atas Rekening</label>
              <input
                name="account_holder"
                className="form-input"
                defaultValue={editing?.account_holder ?? ""}
                placeholder="Mis. GKI Jakarta Pusat"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="form-label">Peruntukan (Purpose)</label>
              <input
                name="purpose"
                className="form-input"
                defaultValue={editing?.purpose ?? ""}
                placeholder="Mis. Kas Umum / Dana Sosial"
                required
              />
              <p className="text-[10px] text-ink-3 mt-1">
                Label yang tampil di dashboard, transaksi, laporan, dan panel deteksi upload.
              </p>
            </div>

            <div>
              <label className="form-label">Mata Uang (ISO 4217)</label>
              <input
                name="currency"
                className="form-input uppercase tracking-wider"
                defaultValue={editing?.currency ?? "IDR"}
                placeholder="IDR"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                list="cur-list"
                required
              />
              <datalist id="cur-list">
                {CURRENCY_PRESET.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-[10px] text-ink-3 mt-1">3 huruf, mis. IDR, USD, SGD, EUR.</p>
            </div>

            <div>
              <label className="form-label">Status</label>
              <select name="status" className="form-select" defaultValue={editing?.status ?? "aktif"}>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Non-aktif</option>
              </select>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Link
                href={`/cabang/${branchId}/tipe-dana/${segmentId}/sub/${subId}`}
                className="btn btn-outline"
              >
                Batal
              </Link>
              <button type="submit" className="btn btn-primary">
                {isEdit ? "Simpan Perubahan" : "Tambah Rekening"}
              </button>
            </div>
          </form>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[12px] text-ink-3">
            Belum ada rekening di Sub Tipe Dana ini. Klik <strong>+ Tambah Rekening</strong> untuk mulai.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-navy text-[14px]">
                      {a.bank} — {a.account_number}
                    </span>
                    <span className={`chip ${a.status === "aktif" ? "chip-green" : "chip-gray"}`}>
                      {a.status}
                    </span>
                    <span className="chip chip-navy">{a.currency}</span>
                  </div>
                  <div className="text-[12px] text-ink-2 mt-0.5">a.n. {a.account_holder}</div>
                  <div className="mt-1.5">
                    <span className="chip chip-purple">📌 {a.purpose}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-[11px] text-ink-3">
                    <span>
                      Saldo: <strong>{formatMoney(a.current_balance, a.currency)}</strong>
                    </span>
                    <span>
                      Sync terakhir:{" "}
                      {a.last_synced_at ? formatDateTime(a.last_synced_at) : "belum pernah"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Link
                    href={`/cabang/${branchId}/tipe-dana/${segmentId}/sub/${subId}?edit=${a.id}`}
                    className="btn btn-outline btn-sm"
                  >
                    Edit
                  </Link>
                  <form
                    action={deleteAccountAction.bind(null, branchId, segmentId, subId, a.id)}
                    className="inline"
                  >
                    <button type="submit" className="btn btn-danger btn-sm">Hapus</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
