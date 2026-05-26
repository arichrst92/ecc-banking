import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getViewMode } from "@/lib/view-mode";
import { LoadingButton } from "@/components/loading-button";
import { upsertRateAction, deleteRateAction } from "./actions";

export const dynamic = "force-dynamic";

type Rate = {
  id: number;
  currency_code: string;
  rate_to_usd: string;
  notes: string | null;
  updated_by_role: string | null;
  updated_at: string;
};

export default async function KursPage({
  searchParams,
}: {
  searchParams: { add?: string; edit?: string; err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const viewMode = getViewMode();

  const rates = await query<Rate>(
    `SELECT id, currency_code, rate_to_usd::TEXT, notes, updated_by_role, updated_at
       FROM exchange_rates
       ORDER BY currency_code = 'USD' DESC, currency_code ASC`
  );

  const showForm = searchParams.add === "1" || !!searchParams.edit;
  const editing = searchParams.edit
    ? rates.find((r) => r.currency_code === searchParams.edit?.toUpperCase())
    : null;
  const isEdit = !!editing;

  return (
    <>
      <Topbar
        title="Pengaturan Kurs"
        role={session.role}
        subtitle={`${rates.length} mata uang terdaftar. Update manual; nanti bisa di-pull dari API.`}
        viewMode={viewMode}
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

      <div className="card mb-4 bg-brand-orange-soft border-brand-orange/30">
        <h3 className="font-semibold text-[13px] text-navy mb-1">
          💱 Cara Kerja View in USD
        </h3>
        <p className="text-[12px] text-ink-2 leading-relaxed">
          Toggle <strong>"View in USD"</strong> di pojok kanan atas Dashboard/Laporan/Transaksi
          akan mengkonversi semua amount ke USD pakai rate di bawah ini. Data DB tetap
          dalam mata uang asli — konversi <strong>display-only</strong>.
        </p>
        <p className="text-[11px] text-ink-3 mt-2">
          Format rate: <strong>1 USD = N currency</strong>. Contoh: kalau IDR rate = 15800,
          artinya 1 USD = Rp 15,800. Amount Rp 50,000,000 akan tampil sebagai $3,164.56 saat
          USD view aktif.
        </p>
      </div>

      {!showForm && (
        <div className="mb-4 flex justify-end">
          <Link href="/kurs?add=1" className="btn btn-gold">+ Tambah Mata Uang</Link>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[14px]">
              {isEdit ? `Edit Rate — ${editing!.currency_code}` : "Tambah Mata Uang Baru"}
            </h2>
            <Link href="/kurs" className="btn btn-outline btn-sm">Batal</Link>
          </div>

          <form action={upsertRateAction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="form-label">Kode Mata Uang (ISO 4217)</label>
              <input
                name="currency_code"
                className="form-input uppercase tracking-wider font-mono"
                defaultValue={editing?.currency_code ?? ""}
                placeholder="IDR / MYR / USD"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                required
                readOnly={isEdit}
              />
              {isEdit && (
                <p className="text-[10px] text-ink-3 mt-1">Kode tidak bisa diubah saat edit.</p>
              )}
            </div>
            <div>
              <label className="form-label">Rate (1 USD = N currency)</label>
              <input
                name="rate_to_usd"
                type="number"
                step="0.000001"
                min={0.000001}
                className="form-input"
                defaultValue={editing?.rate_to_usd ?? ""}
                placeholder="Mis. 15800 untuk IDR"
                required
              />
              <p className="text-[10px] text-ink-3 mt-1">
                Berapa unit currency setara 1 USD. Untuk USD: isi 1.
              </p>
            </div>
            <div>
              <label className="form-label">Catatan</label>
              <input
                name="notes"
                className="form-input"
                defaultValue={editing?.notes ?? ""}
                placeholder="Mis. Rupiah Indonesia · sumber BI rate 13 Mei 2026"
              />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2 pt-2">
              <Link href="/kurs" className="btn btn-outline">Batal</Link>
              <LoadingButton variant="primary" loadingText="Menyimpan...">
                {isEdit ? "Update Rate" : "Tambah Mata Uang"}
              </LoadingButton>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Mata Uang</th>
              <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">1 USD =</th>
              <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">1 unit = USD</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Catatan</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Last Update</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const rate = parseFloat(r.rate_to_usd);
              const reciprocal = rate > 0 ? 1 / rate : 0;
              const isBase = r.currency_code === "USD";
              return (
                <tr key={r.id} className={`border-b border-line ${isBase ? "bg-brand-yellow-soft" : ""}`}>
                  <td className="py-2.5 px-2">
                    <span className="font-mono font-semibold text-navy">{r.currency_code}</span>
                    {isBase && (
                      <span className="ml-2 chip chip-amber">BASE</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">
                    {rate.toLocaleString("en-US", {
                      maximumFractionDigits: 6,
                    })}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-ink-3 text-[11px]">
                    ${reciprocal.toLocaleString("en-US", { maximumFractionDigits: 8 })}
                  </td>
                  <td className="py-2.5 px-2 text-ink-2 text-[11px]">
                    {r.notes ?? "—"}
                  </td>
                  <td className="py-2.5 px-2 text-[11px] text-ink-3">
                    {formatDateTime(r.updated_at)}
                    {r.updated_by_role && (
                      <div className="text-[10px]">by {r.updated_by_role}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <div className="inline-flex gap-1.5">
                      <Link
                        href={`/kurs?edit=${r.currency_code}`}
                        className="btn btn-outline btn-sm"
                      >
                        Edit
                      </Link>
                      {!isBase && (
                        <form
                          action={deleteRateAction.bind(null, r.currency_code)}
                          className="inline"
                        >
                          <LoadingButton
                            variant="danger"
                            size="sm"
                            loadingText="..."
                            confirm={`Hapus rate untuk ${r.currency_code}?\n\nAmount akun bermata uang ini akan tampil dengan tanda (?) saat USD view aktif.`}
                          >
                            Hapus
                          </LoadingButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rates.length === 0 && (
          <p className="text-[12px] text-ink-3 text-center py-8">
            Belum ada rate. Jalankan migration 0011 atau tambah manual.
          </p>
        )}
      </div>
    </>
  );
}
