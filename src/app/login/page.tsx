import { query } from "@/lib/db";
import type { Branch } from "@/lib/types";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { err?: string };
}) {
  const branches = await query<Pick<Branch, "id" | "name" | "code" | "status">>(
    `SELECT id, name, code, status FROM branches WHERE status = 'aktif' ORDER BY name`
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy via-navy-3 to-[#2a4a8a] px-4 relative overflow-hidden">
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-gold/[0.06] pointer-events-none" />
      <div className="absolute -bottom-[15%] -left-[5%] w-[400px] h-[400px] rounded-full bg-gold/[0.04] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl border border-gold/25 rounded-3xl p-10 text-center">
        <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 p-3 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-ecc.webp" alt="ECC Global Finance" className="max-w-full max-h-full object-contain" />
        </div>
        <p className="font-serif text-[10px] font-light tracking-[0.2em] uppercase text-white/40 mb-1">ECC Global Finance</p>
        <h1 className="font-serif text-2xl text-white mb-1.5">Sistem Rekap Keuangan</h1>
        <p className="text-[13px] text-white/45 mb-8">Masukkan kode akses untuk melanjutkan</p>

        <form action={loginAction} className="space-y-3.5 text-left">
          <div>
            <label className="block text-[11px] font-medium text-white/55 uppercase tracking-wider mb-1.5">Masuk Sebagai</label>
            <select
              name="scope"
              defaultValue="global"
              className="w-full px-4 py-3 bg-white/[0.07] border border-white/10 rounded-xl text-white text-[15px] outline-none focus:border-gold transition-colors"
              id="auth-scope"
            >
              <option value="global">Global Administrator</option>
              <option value="branch">Cabang / Jemaat</option>
            </select>
          </div>

          <div id="branch-wrap" className="hidden">
            <label className="block text-[11px] font-medium text-white/55 uppercase tracking-wider mb-1.5">Pilih Cabang</label>
            <select
              name="branch_id"
              className="w-full px-4 py-3 bg-white/[0.07] border border-white/10 rounded-xl text-white text-[15px] outline-none focus:border-gold transition-colors"
              defaultValue=""
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-white/55 uppercase tracking-wider mb-1.5">Kode Akses (8 Digit)</label>
            <input
              name="code"
              type="password"
              inputMode="numeric"
              maxLength={8}
              pattern="\d{8}"
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 bg-white/[0.07] border border-white/10 rounded-xl text-white text-[15px] outline-none focus:border-gold tracking-[0.3em] text-center transition-colors"
            />
          </div>

          {searchParams.err && (
            <p className="text-bad-2 text-[12px] text-center">{searchParams.err}</p>
          )}

          <button
            type="submit"
            className="w-full px-4 py-3.5 bg-gold text-navy font-bold rounded-xl text-[15px] hover:bg-gold-2 transition-colors"
          >
            Masuk ke Sistem
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-white/45">Powered by</span>
          <span className="text-[11px] text-white/80 font-semibold">PT Solusi Inovasi Bangsa</span>
          <span className="inline-flex items-center bg-white rounded-md px-2 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-idea.webp" alt="IDEA" className="h-3.5 w-auto" />
          </span>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              const s = document.getElementById('auth-scope');
              const w = document.getElementById('branch-wrap');
              function sync(){ w.classList.toggle('hidden', s.value !== 'branch'); }
              s.addEventListener('change', sync); sync();
            })();
          `,
        }}
      />
    </div>
  );
}
