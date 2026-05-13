import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";

export default function TransaksiPage() {
  const session = getSession()!;
  return (
    <>
      <Topbar title="Transaksi" role={session.role} />
      <div className="card">
        <p className="text-[12px] text-ink-3">Skeleton — Milestone 4. Tabel transaksi dengan filter.</p>
      </div>
    </>
  );
}
