import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { createBranchAction, updateBranchAction, deleteBranchAction } from "./actions";

export const dynamic = "force-dynamic";

type BranchRow = {
  id: number; name: string; code: string; pic_name: string; pic_phone: string | null;
  status: "aktif" | "nonaktif" | "review"; notes: string | null;
  segment_count: number;
  sub_count: number;
  account_count: number;
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
            COALESCE((SELECT COUNT(*)::INT FROM accounts a WHERE a.branch_id = b.id), 0) AS account_count
       FROM branches b
       ORDER BY b.name`
  );

  const showForm = searchParams.show === "form" || !!searchParams.edit;
  const editing = searchParams.edit
    ? branches.find((b) => b.id === Number(searchParams.edit))
    : null;
  const isEdit = !!editing;

  return (
    <>
      <Topbar
        title="Kelola Cabang"
        role={session.role}
        subtitle={`${branches.length} cabang terdaftar`}
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
              <input
                name="name"
                className="form-input"
                defaultValue={editing?.name ?? ""}
                placeholder="Mis. Jemaat Jakarta Pusat"
                required
              />
            </div>

            <div>
              <label className="form-label">Kode Cabang</label>
              <input
                name="code"
                className="form-input uppercase"
                defaultValue={editing?.code ?? ""}
                placeholder="Mis. JKT-P"
                pattern="[A-Za-z0-9\-]{2,16}"
                required
              />
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
              <input
                name="pic_name"
                className="form-input"
                defaultValue={editing?.pic_name ?? ""}
                placeholder="Mis. Pdt. Andreas Santoso"
                required
              />
            </div>

            <div>
              <label className="form-label">No. WhatsApp PIC</label>
              <input
                name="pic_phone"
                className="form-input"
                defaultValue={editing?.pic_phone ?? ""}
                placeholder="Mis. +6281234567890"
              />
            </div>

            <div className="md:col-span-2">
              <label className="form-label">Catatan (opsional)</label>
              <textarea
                name="notes"
                className="form-textarea"
                rows={2}
                defaultValue={editing?.notes ?? ""}
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Link href="/cabang" className="btn btn-outline">Batal</Link>
              <button type="submit" className="btn btn-primary">
                {isEdit ? "Simpan Perubahan" : "Tambah Cabang"}
              </button>
            </div>
          </form>

          {!isEdit && (
            <p className="text-[11px] text-ink-3 mt-3">
              Setelah cabang ditambahkan, kode akses 8-digit akan otomatis di-create dengan placeholder.
              Jangan lupa <strong>set kode akses</strong> di menu Kode Akses sebelum dipakai bendahara.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {branches.map((b) => (
          <div key={b.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-navy text-[14px]">{b.name}</span>
                  <span
                    className={`chip ${
                      b.status === "aktif"
                        ? "chip-green"
                        : b.status === "review"
                        ? "chip-amber"
                        : "chip-gray"
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
                <div className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-3">
                  <span>Kode: <strong>{b.code}</strong></span>
                  <span>PIC: {b.pic_name}</span>
                  {b.pic_phone && <span>WA: {b.pic_phone}</span>}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-2">
                  <span><strong>{b.segment_count}</strong> Tipe Dana</span>
                  <span className="text-ink-3">·</span>
                  <span><strong>{b.sub_count}</strong> Sub Tipe Dana</span>
                  <span className="text-ink-3">·</span>
                  <span><strong>{b.account_count}</strong> Rekening</span>
                </div>
                {b.notes && <p className="text-[11px] text-ink-3 italic mt-1">{b.notes}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Link href={`/cabang/${b.id}`} className="btn btn-outline btn-sm">
                  Kelola Tipe Dana
                </Link>
                <Link href={`/cabang?edit=${b.id}`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <form action={deleteBranchAction.bind(null, b.id)} className="inline">
                  <button type="submit" className="btn btn-danger btn-sm">Hapus</button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
