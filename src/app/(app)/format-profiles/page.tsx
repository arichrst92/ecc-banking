import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { FormatProfile } from "@/lib/types";
import { toggleProfileStatusAction, deleteProfileAction } from "./actions";

export const dynamic = "force-dynamic";

type Row = Pick<
  FormatProfile,
  "id" | "name" | "bank_hint" | "status" | "created_by" |
  "upload_count" | "success_count" | "fail_count" |
  "last_used_at" | "llm_model" | "llm_cost_usd" | "created_at"
>;

export default async function FormatProfilesPage({
  searchParams,
}: {
  searchParams: { err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const profiles = await query<Row>(
    `SELECT id, name, bank_hint, status, created_by,
            upload_count, success_count, fail_count,
            last_used_at, llm_model, llm_cost_usd, created_at
       FROM format_profiles
       ORDER BY status, last_used_at DESC NULLS LAST, name`
  );

  // Total cost LLM yang sudah keluar
  const totalCostRow = await query<{ total: string }>(
    `SELECT COALESCE(SUM(llm_cost_usd), 0)::TEXT AS total FROM format_profiles WHERE created_by = 'llm'`
  );
  const totalCost = parseFloat(totalCostRow[0]?.total ?? "0");

  return (
    <>
      <Topbar
        title="Kelola Format Parser"
        role={session.role}
        subtitle={`${profiles.length} profile · ${profiles.filter(p => p.status === "active").length} active · LLM total cost: $${totalCost.toFixed(4)}`}
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

      <div className="card mb-4 bg-[#eef3fd] border-[#c5d4f7]">
        <h3 className="font-semibold text-[13px] text-info mb-1.5">Bagaimana ini bekerja?</h3>
        <p className="text-[12px] text-ink-2 leading-relaxed">
          Saat user upload file dengan format tidak dikenal, sistem analisa via Claude API
          dan otomatis generate profile parser. Profile yang sudah ter-create akan dipakai
          untuk upload berikutnya dengan format sama — instant + gratis. Profile bisa
          di-disable kalau hasil parse tidak akurat.
        </p>
        <p className="text-[11px] text-ink-3 mt-2">
          ⚠ Hati-hati edit JSON config — pattern salah bisa break parser. Backup config
          sebelum edit besar.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-[12px] text-ink-3">
            Belum ada format profile. Upload file dengan format unknown via{" "}
            <Link href="/upload" className="text-info underline">Upload Mutasi</Link>{" "}
            — sistem akan auto-generate profile.
          </p>
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Nama Profile</th>
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Source</th>
                <th className="text-center py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Status</th>
                <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Pemakaian</th>
                <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Cost LLM</th>
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Terakhir</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const successRate = p.upload_count > 0
                  ? (p.success_count / p.upload_count * 100).toFixed(0)
                  : "—";
                return (
                  <tr key={p.id} className="border-b border-line hover:bg-cream">
                    <td className="py-2.5 px-2">
                      <div className="font-medium">{p.name}</div>
                      {p.bank_hint && (
                        <div className="text-[10px] text-ink-3">{p.bank_hint}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      {p.created_by === "llm" ? (
                        <span className="chip chip-purple">🤖 AI ({p.llm_model?.slice(0, 14) ?? "—"})</span>
                      ) : p.created_by === "manual" ? (
                        <span className="chip chip-blue">Manual</span>
                      ) : (
                        <span className="chip chip-gray">Seed</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`chip ${
                          p.status === "active"
                            ? "chip-green"
                            : p.status === "pending_review"
                            ? "chip-amber"
                            : "chip-gray"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="font-medium">{p.upload_count}× upload</div>
                      <div className="text-[10px] text-ink-3">
                        {p.success_count} sukses
                        {p.fail_count > 0 && <span className="text-bad-2">, {p.fail_count} gagal</span>}
                        {" · "}{successRate}%
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-ink-2">
                      {p.llm_cost_usd ? `$${parseFloat(p.llm_cost_usd).toFixed(4)}` : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-[10px] text-ink-3">
                      {p.last_used_at ? formatDateTime(p.last_used_at) : "belum dipakai"}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="inline-flex gap-1.5">
                        <Link
                          href={`/format-profiles/${p.id}`}
                          className="btn btn-outline btn-sm"
                        >
                          Detail
                        </Link>
                        {p.status === "active" ? (
                          <form action={toggleProfileStatusAction.bind(null, p.id, "disabled")} className="inline">
                            <button
                              type="submit"
                              className="btn btn-danger btn-sm"
                              data-confirm={`Disable profile "${p.name}"? Upload format ini akan fallback ke LLM lagi (cost + latency).`}
                            >
                              Disable
                            </button>
                          </form>
                        ) : (
                          <form action={toggleProfileStatusAction.bind(null, p.id, "active")} className="inline">
                            <button type="submit" className="btn btn-success btn-sm">
                              Aktifkan
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
