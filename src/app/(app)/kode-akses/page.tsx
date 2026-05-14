import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { resetCodeAction } from "./actions";

export const dynamic = "force-dynamic";

type CodeRow = {
  scope: "global" | "branch";
  branch_id: number | null;
  branch_name: string | null;
  branch_code: string | null;
  is_placeholder: boolean;
  last_used_at: string | null;
  updated_at: string;
};

export default async function KodeAksesPage({
  searchParams,
}: {
  searchParams: { err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const codes = await query<CodeRow>(
    `SELECT ac.scope, ac.branch_id, b.name AS branch_name, b.code AS branch_code,
            (ac.code_hash LIKE 'PLACEHOLDER%') AS is_placeholder,
            ac.last_used_at, ac.updated_at
       FROM auth_codes ac
       LEFT JOIN branches b ON b.id = ac.branch_id
      WHERE ac.is_active = true
      ORDER BY ac.scope DESC, b.name`
  );

  const globalCode = codes.find((c) => c.scope === "global");
  const branchCodes = codes.filter((c) => c.scope === "branch");

  return (
    <>
      <Topbar
        title="Kode Akses"
        role={session.role}
        subtitle="Reset kode 8-digit. Kode bcrypt-hashed di DB, tidak bisa dilihat plain-text."
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

      <div className="card mb-4 bg-[#fef9ee] border-[#f5e5a0]">
        <h3 className="font-semibold text-[14px] text-[#8a5a0a] mb-1.5">⚠ Penting</h3>
        <p className="text-[12px] text-ink-2 leading-relaxed">
          Setelah reset, <strong>kirim kode baru secara aman</strong> ke PIC cabang via WhatsApp/SMS.
          Kode tidak akan tampil lagi di sistem (hanya hash yang disimpan). Setiap reset dicatat di audit log.
        </p>
      </div>

      {/* Global */}
      <div className="card mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-[14px]">
              Kode Global Administrator
              {globalCode?.is_placeholder && (
                <span className="ml-2 chip chip-red">PLACEHOLDER — wajib reset</span>
              )}
            </h3>
            <p className="text-[11px] text-ink-3 mt-0.5">
              Akses semua cabang + manajemen sistem.
              {globalCode?.last_used_at && (
                <span> Last used: {formatDateTime(globalCode.last_used_at)}</span>
              )}
            </p>
          </div>
        </div>

        <form action={resetCodeAction} className="flex items-end gap-2">
          <input type="hidden" name="scope" value="global" />
          <div className="flex-1 max-w-xs">
            <label className="form-label">Kode baru (8 digit)</label>
            <input
              name="new_code"
              type="password"
              inputMode="numeric"
              pattern="\d{8}"
              maxLength={8}
              required
              className="form-input tracking-[0.3em] text-center"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn btn-gold">Reset Global Code</button>
        </form>
      </div>

      {/* Per Branch */}
      <div className="card">
        <h3 className="font-semibold text-[14px] mb-3">Kode per Cabang</h3>
        {branchCodes.length === 0 ? (
          <p className="text-[12px] text-ink-3">Belum ada cabang terdaftar.</p>
        ) : (
          <div className="space-y-3">
            {branchCodes.map((c) => (
              <div
                key={c.branch_id ?? "x"}
                className="flex items-end justify-between gap-3 pb-3 border-b border-line last:border-b-0 last:pb-0"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px]">{c.branch_name ?? "—"}</span>
                    <span className="text-[10px] text-ink-3">({c.branch_code})</span>
                    {c.is_placeholder && (
                      <span className="chip chip-red">PLACEHOLDER — wajib reset</span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-3 mt-0.5">
                    Last used: {c.last_used_at ? formatDateTime(c.last_used_at) : "belum pernah"}
                    {" · "}Updated: {formatDateTime(c.updated_at)}
                  </p>
                </div>
                <form
                  action={resetCodeAction}
                  className="flex items-end gap-2 shrink-0"
                >
                  <input type="hidden" name="scope" value="branch" />
                  <input type="hidden" name="branch_id" value={c.branch_id ?? ""} />
                  <input
                    name="new_code"
                    type="password"
                    inputMode="numeric"
                    pattern="\d{8}"
                    maxLength={8}
                    required
                    className="form-input tracking-[0.3em] text-center w-32"
                    placeholder="••••••••"
                  />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Reset
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
