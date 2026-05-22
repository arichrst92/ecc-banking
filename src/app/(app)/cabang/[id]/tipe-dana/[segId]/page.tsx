import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import type { Branch, Segment, SubSegment } from "@/lib/types";
import {
  createSubSegmentAction,
  updateSubSegmentAction,
  deleteSubSegmentAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SubRow = SubSegment & { account_count: number };

export default async function TipeDanaDetailPage({
  params,
  searchParams,
}: {
  params: { id: string; segId: string };
  searchParams: { show?: string; edit?: string; err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const branchId = Number(params.id);
  const segmentId = Number(params.segId);
  if (isNaN(branchId) || isNaN(segmentId)) notFound();

  const branch = await queryOne<Branch>(`SELECT * FROM branches WHERE id = $1`, [branchId]);
  if (!branch) notFound();

  const segment = await queryOne<Segment>(
    `SELECT * FROM segments WHERE id = $1 AND branch_id = $2`,
    [segmentId, branchId]
  );
  if (!segment) notFound();

  const subs = await query<SubRow>(
    `SELECT ss.*,
            COALESCE((SELECT COUNT(*)::INT FROM accounts a WHERE a.sub_segment_id = ss.id), 0) AS account_count
       FROM sub_segments ss
      WHERE ss.segment_id = $1
      ORDER BY ss.display_order, ss.name`,
    [segmentId]
  );

  const showForm = searchParams.show === "form" || !!searchParams.edit;
  const editing = searchParams.edit
    ? subs.find((s) => s.id === Number(searchParams.edit))
    : null;
  const isEdit = !!editing;

  return (
    <>
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href="/cabang" className="hover:text-navy">Cabang</Link>
        <span className="mx-1">›</span>
        <Link href={`/cabang/${branchId}`} className="hover:text-navy">{branch.name}</Link>
        <span className="mx-1">›</span>
        <span className="text-navy font-medium">{segment.name}</span>
      </div>

      <Topbar
        title={`Sub Tipe Dana — ${segment.name}`}
        role={session.role}
        subtitle={`Cabang ${branch.name}${segment.code ? ` · Kode ${segment.code}` : ""}`}
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
          <Link href={`/cabang/${branchId}/tipe-dana/${segmentId}?show=form`} className="btn btn-gold">
            + Tambah Sub Tipe Dana
          </Link>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[14px]">
              {isEdit ? `Edit Sub Tipe Dana — ${editing!.name}` : "Tambah Sub Tipe Dana Baru"}
            </h2>
            <Link href={`/cabang/${branchId}/tipe-dana/${segmentId}`} className="btn btn-outline btn-sm">Batal</Link>
          </div>

          <form
            action={
              isEdit
                ? updateSubSegmentAction.bind(null, branchId, segmentId, editing!.id)
                : createSubSegmentAction.bind(null, branchId, segmentId)
            }
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <div className="md:col-span-2">
              <label className="form-label">Nama Sub Tipe Dana</label>
              <input
                name="name"
                className="form-input"
                defaultValue={editing?.name ?? ""}
                placeholder={`Mis. ${segment.name} - Listrik & Air`}
                required
              />
            </div>

            <div>
              <label className="form-label">Kode (opsional)</label>
              <input
                name="code"
                className="form-input uppercase"
                defaultValue={editing?.code ?? ""}
                maxLength={16}
              />
            </div>

            <div>
              <label className="form-label">Status</label>
              <select name="status" className="form-select" defaultValue={editing?.status ?? "aktif"}>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Non-aktif</option>
              </select>
            </div>

            <div>
              <label className="form-label">Urutan Tampil</label>
              <input
                name="display_order"
                type="number"
                className="form-input"
                min={0}
                max={9999}
                defaultValue={editing?.display_order ?? 0}
              />
            </div>

            <div className="md:col-span-2">
              <label className="form-label">Catatan</label>
              <textarea
                name="notes"
                className="form-textarea"
                rows={2}
                defaultValue={editing?.notes ?? ""}
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Link href={`/cabang/${branchId}/tipe-dana/${segmentId}`} className="btn btn-outline">Batal</Link>
              <button type="submit" className="btn btn-primary">
                {isEdit ? "Simpan Perubahan" : "Tambah"}
              </button>
            </div>
          </form>
        </div>
      )}

      {subs.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[12px] text-ink-3">
            Belum ada Sub Tipe Dana. Klik <strong>+ Tambah Sub Tipe Dana</strong> untuk mulai.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <div key={s.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-navy text-[14px]">{s.name}</span>
                    {s.code && <span className="chip chip-navy">{s.code}</span>}
                    <span className={`chip ${s.status === "aktif" ? "chip-green" : "chip-gray"}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[12px] text-ink-2">
                    <strong>{s.account_count}</strong> Rekening
                  </div>
                  {s.notes && (
                    <p className="text-[11px] text-ink-3 italic mt-1">{s.notes}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Link
                    href={`/cabang/${branchId}/tipe-dana/${segmentId}/sub/${s.id}`}
                    className="btn btn-outline btn-sm"
                  >
                    Kelola Rekening
                  </Link>
                  <Link
                    href={`/cabang/${branchId}/tipe-dana/${segmentId}?edit=${s.id}`}
                    className="btn btn-outline btn-sm"
                  >
                    Edit
                  </Link>
                  <form
                    action={deleteSubSegmentAction.bind(null, branchId, segmentId, s.id)}
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
