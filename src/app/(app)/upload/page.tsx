import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { uploadFileAction, deleteUploadAction } from "./actions";

export const dynamic = "force-dynamic";

type RecentUpload = {
  id: number;
  filename: string;
  status: "pending" | "processing" | "success" | "failed";
  tx_inserted: number;
  tx_duplicates: number;
  parser_name: string;
  uploaded_at: string;
  branch_name: string;
  branch_code: string;
  segment_name: string;
  sub_name: string;
  bank: string;
  account_number: string;
  account_purpose: string;
  currency: string;
  opening_balance: string | null;
  closing_balance: string | null;
};

export default async function UploadPage({
  searchParams,
}: {
  searchParams: { err?: string; msg?: string };
}) {
  const session = getSession()!;

  // Recent uploads (filter by branch kalau role branch)
  const where = session.role === "branch" ? `WHERE u.branch_id = $1` : "";
  const params = session.role === "branch" ? [session.branchId] : [];
  const recent = await query<RecentUpload>(
    `SELECT u.id, u.filename, u.status, u.tx_inserted, u.tx_duplicates, u.parser_name,
            u.uploaded_at, u.currency, u.opening_balance, u.closing_balance,
            b.name AS branch_name, b.code AS branch_code,
            s.name AS segment_name, ss.name AS sub_name,
            a.bank, a.account_number, a.purpose AS account_purpose
       FROM uploads u
       JOIN accounts a ON a.id = u.account_id
       JOIN sub_segments ss ON ss.id = a.sub_segment_id
       JOIN segments s ON s.id = ss.segment_id
       JOIN branches b ON b.id = u.branch_id
       ${where}
       ORDER BY u.uploaded_at DESC
       LIMIT 15`,
    params
  );

  return (
    <>
      <Topbar
        title="Upload Mutasi"
        role={session.role}
        subtitle="Pilih file mutasi rekening. Format support: BCA CSV."
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

      <div className="card mb-5">
        <h3 className="font-semibold text-[14px] mb-2">Upload File Mutasi</h3>
        <p className="text-[12px] text-ink-3 mb-4">
          Drag-drop atau klik untuk pilih file. Sistem akan deteksi nomor rekening dari isi file
          dan tampilkan preview sebelum simpan.
        </p>

        <form action={uploadFileAction} encType="multipart/form-data" className="space-y-3">
          <label
            htmlFor="file-input"
            className="block border-2 border-dashed border-line rounded-2xl py-10 px-6 text-center cursor-pointer hover:border-navy-3 hover:bg-cream transition-colors"
          >
            <div className="text-[40px] mb-2">📄</div>
            <div className="font-semibold text-[14px] text-navy">Klik untuk pilih file</div>
            <div className="text-[11px] text-ink-3 mt-1">
              .csv (BCA Corporate atau Personal)
            </div>
            <input
              id="file-input"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="hidden"
              onChange={undefined}
            />
            <div id="file-name" className="text-[12px] text-good mt-3 font-medium"></div>
          </label>

          <div className="flex justify-end gap-2">
            <button type="submit" className="btn btn-gold">
              Deteksi & Preview
            </button>
          </div>

          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function () {
                  const inp = document.getElementById('file-input');
                  const out = document.getElementById('file-name');
                  inp.addEventListener('change', () => {
                    if (inp.files && inp.files[0]) {
                      const f = inp.files[0];
                      out.textContent = '✓ ' + f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)';
                    }
                  });
                })();
              `,
            }}
          />
        </form>
      </div>

      <div className="card">
        <h3 className="font-semibold text-[14px] mb-3">Upload Terakhir</h3>
        {recent.length === 0 ? (
          <p className="text-[12px] text-ink-3">Belum ada upload.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Waktu</th>
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Path Akun</th>
                  <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">File</th>
                  <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Saldo Awal → Akhir</th>
                  <th className="text-center py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Status</th>
                  <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Trx</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-line hover:bg-cream">
                    <td className="py-2.5 px-2 text-ink-3 whitespace-nowrap">{formatDateTime(r.uploaded_at)}</td>
                    <td className="py-2.5 px-2 text-[11px]">
                      <div className="font-medium text-ink">{r.branch_name}</div>
                      <div className="text-ink-2 leading-tight">
                        <span className="text-ink-3">›</span> {r.segment_name}
                      </div>
                      <div className="text-ink-2 leading-tight">
                        <span className="text-ink-3">›</span> {r.sub_name}
                      </div>
                      <div className="text-ink-2 leading-tight font-medium">
                        <span className="text-ink-3">›</span> {r.bank} {r.account_number.slice(-4)}
                      </div>
                      <div className="text-[10px] text-ink-3 italic">{r.account_purpose} · {r.currency}</div>
                    </td>
                    <td className="py-2.5 px-2 text-ink-2 text-[11px]">
                      <div>{r.filename}</div>
                      <div className="text-[10px] text-ink-3">{r.parser_name}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-[11px] text-ink-2">
                      <div>{formatMoney(r.opening_balance, r.currency)}</div>
                      <div className="text-good">→ {formatMoney(r.closing_balance, r.currency)}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`chip ${
                          r.status === "success"
                            ? "chip-green"
                            : r.status === "pending"
                            ? "chip-amber"
                            : r.status === "processing"
                            ? "chip-blue"
                            : "chip-red"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="font-semibold">{r.tx_inserted}</div>
                      {r.tx_duplicates > 0 && (
                        <div className="text-[10px] text-ink-3">+{r.tx_duplicates} dup</div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="inline-flex gap-1.5">
                        {r.status === "pending" && (
                          <Link href={`/upload/${r.id}`} className="btn btn-outline btn-sm">
                            Review
                          </Link>
                        )}
                        {r.status !== "processing" && (
                          <form action={deleteUploadAction.bind(null, r.id)} className="inline">
                            <button
                              type="submit"
                              className="btn btn-danger btn-sm"
                              data-confirm={
                                r.status === "success"
                                  ? `Hapus upload "${r.filename}"?\n\n${r.tx_inserted} transaksi yang sudah masuk akan IKUT TERHAPUS dan saldo akun akan di-recalculate.\n\nAksi ini tidak bisa di-undo.`
                                  : `Hapus upload "${r.filename}"?\n\nUpload ini masih ${r.status}, belum ada transaksi tersimpan.`
                              }
                            >
                              Hapus
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm dialog untuk tombol dengan data-confirm */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.querySelectorAll('[data-confirm]').forEach(function (btn) {
              btn.addEventListener('click', function (e) {
                if (!window.confirm(btn.dataset.confirm)) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              });
            });
          `,
        }}
      />
    </>
  );
}
