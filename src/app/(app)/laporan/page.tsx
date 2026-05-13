import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";

export default function LaporanPage() {
  const session = getSession()!;
  return (
    <>
      <Topbar title="Laporan Keuangan" role={session.role} />
      <div className="card">
        <p className="text-[12px] text-ink-3">Skeleton — Milestone 4. Chart + tabel kategori per rekening.</p>
      </div>
    </>
  );
}
