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
      {/* Konten — pb besar supaya tidak tertutup dock bawah */}
      <main className="mx-auto w-full min-w-0 max-w-screen-2xl flex-1 px-4 pb-28 pt-6 sm:px-8">
        {children}
      </main>

      <BottomNav role={session.role} branchName={branchName} />
    </div>
  );
}
