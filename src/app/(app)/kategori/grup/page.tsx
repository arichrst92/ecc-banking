import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import type { CategoryGroup } from "@/lib/types";
import { createGroupAction, updateGroupAction, deleteGroupAction } from "./actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  revenue: "Revenue (pemasukan)",
  expense: "Expense (pengeluaran)",
  other: "Lainnya (net)",
};

export default async function GrupPage({
  searchParams,
}: {
  searchParams: { show?: string; edit?: string; err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const groups = await query<CategoryGroup & { cat_count: number }>(
    `SELECT g.*, COUNT(c.id)::INT AS cat_count
       FROM category_groups g
       LEFT JOIN categories c ON c.group_id = g.id
      GROUP BY g.id
      ORDER BY g.display_order, g.name`
  );

  const showForm = searchParams.show === "form" || !!searchParams.edit;
  const editing = searchParams.edit ? groups.find((g) => g.id === Number(searchParams.edit)) : null;
  const isEdit = !!editing;

  return (
    <>
      <Topbar
        title="Grup Kategori"
        role={session.role}
        subtitle="Pengelompokan kategori untuk Chart of Accounts & Laporan Fiskal."
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

      <div className="mb-4 flex justify-between items-center">
        <Link href="/kategori" className="btn btn-outline btn-sm">← Kategori</Link>
        {!showForm && <Link href="/kategori/grup?show=form" className="btn btn-gold">+ Tambah Grup</Link>}
      </div>

      {showForm && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[14px]">{isEdit ? "Edit Grup" : "Tambah Grup"}</h2>
            <Link href="/kategori/grup" className="btn btn-outline btn-sm">Batal</Link>
          </div>
          <form
            action={isEdit ? updateGroupAction.bind(null, editing!.id) : createGroupAction}
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            <div>
              <label className="form-label">Nama Grup</label>
              <input name="name" className="form-input" defaultValue={editing?.name ?? ""} placeholder="Mis. Revenue Accounts" required />
            </div>
            <div>
              <label className="form-label">Jenis</label>
              <select name="kind" className="form-select" defaultValue={editing?.kind ?? "expense"}>
                <option value="revenue">Revenue (pemasukan)</option>
                <option value="expense">Expense (pengeluaran)</option>
                <option value="other">Lainnya (net)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Urutan Tampil</label>
              <input name="display_order" type="number" min={0} max={9999} className="form-input" defaultValue={editing?.display_order ?? 100} required />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2 pt-2">
              <Link href="/kategori/grup" className="btn btn-outline">Batal</Link>
              <button type="submit" className="btn btn-primary">{isEdit ? "Simpan" : "Tambah"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Nama</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Jenis</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Urutan</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kategori</th>
              <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-line hover:bg-cream">
                <td className="py-2.5 px-2 font-medium">{g.name}</td>
                <td className="py-2.5 px-2 text-ink-2">{KIND_LABEL[g.kind] ?? g.kind}</td>
                <td className="py-2.5 px-2 text-ink-2">{g.display_order}</td>
                <td className="py-2.5 px-2 text-ink-2">{g.cat_count}</td>
                <td className="py-2.5 px-2 text-right">
                  <div className="inline-flex gap-1.5">
                    <Link href={`/kategori/grup?edit=${g.id}`} className="btn btn-outline btn-sm">Edit</Link>
                    <form action={deleteGroupAction.bind(null, g.id)} className="inline">
                      <button type="submit" className="btn btn-danger btn-sm">Hapus</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-ink-3 text-[12px]">Belum ada grup.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
