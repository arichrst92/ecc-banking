import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import type { Category } from "@/lib/types";

export default async function KategoriPage() {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const categories = await query<Category>(
    `SELECT * FROM categories ORDER BY priority ASC, name ASC`
  );

  return (
    <>
      <Topbar title="Kategori Transaksi" role={session.role} subtitle="Berlaku untuk semua cabang" />
      <div className="card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Nama</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Tipe</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kata Kunci</th>
              <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Priority</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-2.5 px-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                    style={{ background: c.color }}
                  />
                  <span className="font-medium">{c.name}</span>
                  {c.is_system && <span className="ml-2 chip chip-gray">system</span>}
                </td>
                <td className="py-2.5 px-2 text-ink-2">{c.type}</td>
                <td className="py-2.5 px-2 text-ink-2 text-[11px]">{c.keywords.join(", ") || "—"}</td>
                <td className="py-2.5 px-2 text-ink-2">{c.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-ink-3 mt-3">CRUD editor di Milestone 2.</p>
      </div>
    </>
  );
}
