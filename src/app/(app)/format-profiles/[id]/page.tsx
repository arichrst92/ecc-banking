import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { queryOne, query } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import type { FormatProfile } from "@/lib/types";
import {
  updateProfileConfigAction,
  toggleProfileStatusAction,
  deleteProfileAction,
} from "../actions";

export const dynamic = "force-dynamic";

type UploadHistory = {
  id: number;
  filename: string;
  status: string;
  tx_inserted: number;
  uploaded_at: string;
  branch_name: string;
  bank: string;
  account_number: string;
};

export default async function FormatProfileDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { err?: string; msg?: string };
}) {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  const profileId = Number(params.id);
  if (isNaN(profileId)) notFound();

  const profile = await queryOne<FormatProfile>(
    `SELECT * FROM format_profiles WHERE id = $1`, [profileId]
  );
  if (!profile) notFound();

  const history = await query<UploadHistory>(
    `SELECT u.id, u.filename, u.status, u.tx_inserted, u.uploaded_at,
            b.name AS branch_name, a.bank, a.account_number
       FROM uploads u
       JOIN accounts a ON a.id = u.account_id
       JOIN branches b ON b.id = u.branch_id
      WHERE u.format_profile_id = $1
      ORDER BY u.uploaded_at DESC
      LIMIT 20`,
    [profileId]
  );

  return (
    <>
      <div className="mb-4">
        <Link href="/format-profiles" className="text-[12px] text-ink-3 hover:text-navy">
          ← Kembali ke daftar profile
        </Link>
      </div>

      <Topbar
        title={`Profile — ${profile.name}`}
        role={session.role}
        subtitle={
          `${profile.bank_hint ?? "(no hint)"} · ${profile.created_by} · ${profile.status}` +
          (profile.llm_model ? ` · model ${profile.llm_model}` : "")
        }
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">UPLOADS</div>
          <div className="text-[20px] font-bold">{profile.upload_count}</div>
        </div>
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">SUCCESS</div>
          <div className="text-[20px] font-bold text-good">{profile.success_count}</div>
        </div>
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">FAILED</div>
          <div className="text-[20px] font-bold text-bad-2">{profile.fail_count}</div>
        </div>
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">LLM COST</div>
          <div className="text-[20px] font-bold">
            ${profile.llm_cost_usd ? parseFloat(profile.llm_cost_usd).toFixed(4) : "0.0000"}
          </div>
          {profile.llm_input_tokens && (
            <div className="text-[10px] text-ink-3">
              {profile.llm_input_tokens} in / {profile.llm_output_tokens} out tokens
            </div>
          )}
        </div>
      </div>

      <form action={updateProfileConfigAction.bind(null, profileId)} className="card mb-4">
        <h3 className="font-semibold text-[14px] mb-3">Edit Profile</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Nama</label>
            <input name="name" className="form-input" defaultValue={profile.name} required />
          </div>
          <div>
            <label className="form-label">Bank Hint</label>
            <input name="bank_hint" className="form-input" defaultValue={profile.bank_hint ?? ""} />
          </div>
        </div>

        <div className="mt-3">
          <label className="form-label">Detect Patterns (regex, 1 per baris)</label>
          <textarea
            name="detect_patterns"
            className="form-textarea font-mono text-[11px]"
            rows={3}
            defaultValue={(profile.detect_patterns ?? []).join("\n")}
            required
          />
          <p className="text-[10px] text-ink-3 mt-1">
            Pattern di-AND match terhadap 2KB pertama file. Tambah pattern unik supaya tidak salah match.
          </p>
        </div>

        <div className="mt-3">
          <label className="form-label">Config (JSON FormatProfileConfig)</label>
          <textarea
            name="config"
            className="form-textarea font-mono text-[10px]"
            rows={20}
            defaultValue={JSON.stringify(profile.config, null, 2)}
            required
          />
          <p className="text-[10px] text-ink-3 mt-1">
            Lihat <code>src/parsers/profile-config.ts</code> untuk schema. JSON harus valid.
          </p>
        </div>

        <div className="mt-3">
          <label className="form-label">Catatan</label>
          <textarea
            name="notes"
            className="form-textarea"
            rows={2}
            defaultValue={profile.notes ?? ""}
          />
        </div>

        <div className="mt-4 flex justify-between items-center">
          <div className="flex gap-2">
            {profile.status === "active" ? (
              <form action={toggleProfileStatusAction.bind(null, profileId, "disabled")} className="inline">
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                  data-confirm="Disable profile ini? Upload format ini akan fallback ke LLM lagi."
                >
                  Disable
                </button>
              </form>
            ) : (
              <form action={toggleProfileStatusAction.bind(null, profileId, "active")} className="inline">
                <button type="submit" className="btn btn-success btn-sm">Aktifkan</button>
              </form>
            )}
            <form action={deleteProfileAction.bind(null, profileId)} className="inline">
              <button
                type="submit"
                className="btn btn-danger btn-sm"
                data-confirm="Hapus profile PERMANEN? Upload history yang reference profile ini akan kehilangan reference (tapi data transaksi tetap aman)."
              >
                Hapus Profile
              </button>
            </form>
          </div>
          <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
        </div>
      </form>

      <div className="card">
        <h3 className="font-semibold text-[14px] mb-3">Upload History Pakai Profile Ini</h3>
        {history.length === 0 ? (
          <p className="text-[12px] text-ink-3">Belum ada upload yang pakai profile ini.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Waktu</th>
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Cabang / Rekening</th>
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">File</th>
                <th className="text-center py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Status</th>
                <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-line">
                  <td className="py-2 px-2 text-ink-3">{formatDateTime(h.uploaded_at)}</td>
                  <td className="py-2 px-2">
                    {h.branch_name}<br />
                    <span className="text-[10px] text-ink-3">{h.bank} · {h.account_number}</span>
                  </td>
                  <td className="py-2 px-2 text-ink-2 text-[11px]">{h.filename}</td>
                  <td className="py-2 px-2 text-center">
                    <span className={`chip ${
                      h.status === "success" ? "chip-green" :
                      h.status === "failed" ? "chip-red" : "chip-amber"
                    }`}>{h.status}</span>
                  </td>
                  <td className="py-2 px-2 text-right">{h.tx_inserted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
