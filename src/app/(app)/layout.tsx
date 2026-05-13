import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { Sidebar } from "@/components/sidebar";

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
    <div className="flex flex-row min-h-screen">
      <Sidebar role={session.role} branchName={branchName} />
      <main className="ml-[244px] flex-1 px-8 py-7 min-h-screen">{children}</main>
    </div>
  );
}
