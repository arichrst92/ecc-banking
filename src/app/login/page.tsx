import { query } from "@/lib/db";
import type { Branch } from "@/lib/types";
import { LoginSubmitButton } from "./login-button";
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-black via-brand-black2 to-[#3a1a05] px-4 relative overflow-hidden">
      <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-brand-orange/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-[15%] -left-[5%] w-[400px] h-[400px] rounded-full bg-brand-yellow/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl border border-brand-orange/30 rounded-3xl p-10 text-center">
        <div className="w-28 h-28 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 p-3 shadow-2xl ring-2 ring-brand-orange/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-ecc.webp" alt="ECC Global Finance" className="max-w-full max-h-full object-contain" />
        </div>
        <p className="font-serif text-[10px] font-light tracking-[0.25em] uppercase text-brand-yellow mb-1">ECC Global Finance</p>
        <h1 className="font-serif text-2xl text-white mb-1.5">Sistem Rekap Keuangan</h1>
        <p className="text-[13px] text-white/50 mb-8">Masukkan kode akses untuk melanjutkan</p>

        <form action={loginAction} className="space-y-3.5 text-left">
          <div>
            <label className="block text-[11px] font-medium text-white/55 uppercase tracking-wider mb-1.5">Masuk Sebagai</label>
            <select
              name="scope"
              defaultValue="global"
              className="w-full px-4 py-3 bg-white/[0.07] border border-white/10 rounded-xl text-white text-[15px] outline-none focus:border-brand-orange transition-colors"
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
              className="w-full px-4 py-3 bg-white/[0.07] border border-white/10 rounded-xl text-white text-[15px] outline-none focus:border-brand-orange transition-colors"
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
              className="w-full px-4 py-3 bg-white/[0.07] border border-white/10 rounded-xl text-white text-[15px] outline-none focus:border-brand-orange focus:bg-white/[0.1] tracking-[0.3em] text-center transition-all"
            />
          </div>

          {searchParams.err && (
            <p className="text-bad-2 text-[12px] text-center">{searchParams.err}</p>
          )}

          <LoginSubmitButton />
        </form>

        <div className="mt-7 pt-5 border-t border-white/10 flex items-center justify-center gap-2.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.15em] text-white/50">Powered by</span>
          <span className="text-[11px] text-white/85 font-semibold">PT Solusi Inovasi Bangsa</span>
          <span className="inline-flex items-center bg-white rounded-md px-2 py-1 shadow-sm">
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
