import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default function KodeAksesPage() {
  const session = getSession()!;
  if (session.role !== "global") redirect("/dashboard");

  return (
    <>
      <Topbar title="Kode Akses" role={session.role} subtitle="Kelola kode 8-digit per cabang & global" />
      <div className="card">
        <p className="text-[12px] text-ink-3">
          Skeleton — Milestone 2. Reset kode global, reset per cabang, audit kode terakhir dipakai.
        </p>
      </div>
    </>
  );
}
