import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { BottomNav } from "@/components/bottom-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect("/login");

  let branchName = "Global Admin";
  if (session.role === "branch" && session.branchId) {
    const row = await queryOne<{ name: string }>(
      `SELECT name FROM branches WHERE id = $1`,
      [session.branchId]
    );
    branchName = row?.name ?? "Cabang";
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* Top brand bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur print-hide">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4 sm:px-8">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white p-0.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-ecc.webp" alt="ECC" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[8px] font-semibold uppercase tracking-[0.15em] text-brand-orange">ECC Global Finance</span>
            <span className="font-serif text-[13px] text-navy">
              {session.role === "global" ? "Global Admin" : branchName}
            </span>
          </div>
          <span
            className={
              session.role === "global"
                ? "ml-auto rounded-full bg-brand-orange px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white"
                : "ml-auto rounded-full bg-brand-black px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-brand-yellow"
            }
          >
            {session.role === "global" ? "Global" : "Cabang"}
          </span>
        </div>
      </header>

      {/* Konten — pb besar supaya tidak tertutup dock bawah */}
      <main className="mx-auto w-full min-w-0 max-w-screen-2xl flex-1 px-4 pb-28 pt-6 sm:px-8">
        {children}
      </main>

      <BottomNav role={session.role} branchName={branchName} />
    </div>
  );
}
