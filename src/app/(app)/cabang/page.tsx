import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";

type BranchWithCount = {
  id: number; name: string; code: string; pic_name: string;
  status: "aktif" | "nonaktif" | "review"; account_count: number;
};

export default async function CabangPage() {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const branches = await query<BranchWithCount>(
    `SELECT b.id, b.name, b.code, b.pic_name, b.status,
            COALESCE((SELECT COUNT(*)::INT FROM accounts a WHERE a.branch_id = b.id), 0) AS account_count
       FROM branches b
       ORDER BY b.name`
  );

  return (
    <>
      <Topbar title="Kelola Cabang" role={session.role} subtitle={`${branches.length} cabang terdaftar`} />
      <div className="space-y-3">
        {branches.map((b) => (
          <div key={b.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-navy text-[14px]">{b.name}</div>
                <div className="text-[11px] text-ink-3 mt-0.5">{b.code} · PIC: {b.pic_name}</div>
              </div>
              <span
                className={`chip ${
                  b.status === "aktif" ? "chip-green" :
                  b.status === "review" ? "chip-amber" : "chip-gray"
                }`}
              >
                {b.status}
              </span>
            </div>
            <div className="mt-3 text-[11px] text-ink-3">
              {b.account_count} rekening — CRUD penuh di Milestone 2
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
