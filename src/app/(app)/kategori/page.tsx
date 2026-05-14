import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import type { Category } from "@/lib/types";
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from "./actions";

export const dynamic = "force-dynamic";

const COLOR_PALETTE = [
  "#2e7d6e", "#c0392b", "#e67e22", "#8e44ad", "#2563eb",
  "#0f1d3a", "#c9a84c", "#8a94a6", "#16a085", "#e91e63",
];

export default async function KategoriPage({
  searchParams,
}: {
  searchParams: { show?: string; edit?: string; err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const categories = await query<Category>(
    `SELECT * FROM categories ORDER BY priority ASC, name ASC`
  );

  const showForm = searchParams.show === "form" || !!searchParams.edit;
  const editing = searchParams.edit
    ? categories.find((c) => c.id === Number(searchParams.edit))
    : null;
  const isEdit = !!editing;

  return (
    <>
      <Topbar
        title="Kategori Transaksi"
        role={session.role}
        subtitle="Berlaku untuk semua cabang. Kategorisasi otomatis pakai keywords."
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
          <Link href="/kategori?show=form" className="btn btn-gold">+ Tambah Kategori</Link>
        </div>
      )}

      {showForm && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[14px]">
              {isEdit ? "Edit Kategori" : "Tambah Kategori Baru"}
            </h2>
            <Link href="/kategori" className="btn btn-outline btn-sm">Batal</Link>
          </div>

          <form
            action={isEdit ? updateCategoryAction.bind(null, editing!.id) : createCategoryAction}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <div>
              <label className="form-label">Nama Kategori</label>
              <input
                name="name"
                className="form-input"
                defaultValue={editing?.name ?? ""}
                placeholder="Mis. Persembahan"
                required
              />
            </div>

            <div>
              <label className="form-label">Tipe Transaksi</label>
              <select name="type" className="form-select" defaultValue={editing?.type ?? "keduanya"}>
                <option value="masuk">Masuk (pemasukan)</option>
                <option value="keluar">Keluar (pengeluaran)</option>
                <option value="keduanya">Keduanya</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="form-label">Kata Kunci (pisah koma, case-insensitive)</label>
              <input
                name="keywords_raw"
                className="form-input"
                defaultValue={(editing?.keywords ?? []).join(", ")}
                placeholder="Mis. PERSEMBAHAN, TITHE, PERPULUHAN"
              />
              <p className="text-[10px] text-ink-3 mt-1">
                Sistem cek substring di keterangan transaksi. Kategori dengan priority lebih kecil dicek lebih dulu.
              </p>
            </div>

            <div>
              <label className="form-label">Warna (hex)</label>
              <div className="flex items-center gap-2">
                <input
                  name="color"
                  className="form-input flex-1"
                  defaultValue={editing?.color ?? "#2563eb"}
                  pattern="^#[0-9a-fA-F]{6}$"
                  required
                  id="color-input"
                />
                <input
                  type="color"
                  defaultValue={editing?.color ?? "#2563eb"}
                  onInput={undefined}
                  className="h-9 w-12 rounded border border-line cursor-pointer"
                  id="color-picker"
                />
              </div>
              <div className="flex gap-1 mt-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-color={c}
                    className="w-5 h-5 rounded-full border border-line color-swatch"
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
              <script
                dangerouslySetInnerHTML={{
                  __html: `
                    (function () {
                      const inp = document.getElementById('color-input');
                      const pck = document.getElementById('color-picker');
                      pck.addEventListener('input', e => inp.value = e.target.value);
                      inp.addEventListener('input', e => pck.value = e.target.value);
                      document.querySelectorAll('.color-swatch').forEach(b => {
                        b.addEventListener('click', () => {
                          inp.value = b.dataset.color;
                          pck.value = b.dataset.color;
                        });
                      });
                    })();
                  `,
                }}
              />
            </div>

            <div>
              <label className="form-label">Priority (lebih kecil = dicek lebih dulu)</label>
              <input
                name="priority"
                type="number"
                min={0}
                max={999}
                className="form-input"
                defaultValue={editing?.priority ?? 100}
                required
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Link href="/kategori" className="btn btn-outline">Batal</Link>
              <button type="submit" className="btn btn-primary">
                {isEdit ? "Simpan Perubahan" : "Tambah Kategori"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Nama</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Tipe</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kata Kunci</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Priority</th>
              <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-line hover:bg-cream">
                <td className="py-2.5 px-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                    style={{ background: c.color }}
                  />
                  <span className="font-medium">{c.name}</span>
                  {c.is_system && <span className="ml-2 chip chip-gray">system</span>}
                </td>
                <td className="py-2.5 px-2 text-ink-2">{c.type}</td>
                <td className="py-2.5 px-2 text-ink-2 text-[11px]">
                  {c.keywords.join(", ") || "—"}
                </td>
                <td className="py-2.5 px-2 text-ink-2">{c.priority}</td>
                <td className="py-2.5 px-2 text-right">
                  {!c.is_system && (
                    <div className="inline-flex gap-1.5">
                      <Link
                        href={`/kategori?edit=${c.id}`}
                        className="btn btn-outline btn-sm"
                      >
                        Edit
                      </Link>
                      <form
                        action={deleteCategoryAction.bind(null, c.id)}
                        className="inline"
                      >
                        <button
                          type="submit"
                          className="btn btn-danger btn-sm"
                          // eslint-disable-next-line @next/next/no-html-link-for-pages
                        >
                          Hapus
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
