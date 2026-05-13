import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";

export default function DashboardPage() {
  const session = getSession()!;
  return (
    <>
      <Topbar title="Dashboard" role={session.role} subtitle="Ringkasan keuangan periode berjalan" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-5">
        {[
          { label: "TOTAL SALDO", value: "Rp 0", sub: "semua rekening", cls: "" },
          { label: "PEMASUKAN BULAN INI", value: "Rp 0", sub: "0 transaksi", cls: "text-good" },
          { label: "PENGELUARAN BULAN INI", value: "Rp 0", sub: "0 transaksi", cls: "text-bad" },
          { label: "SALDO BERSIH", value: "Rp 0", sub: "diff bulan ini", cls: "text-[#a07c20]" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">{s.label}</div>
            <div className={`text-[22px] font-bold leading-none ${s.cls}`}>{s.value}</div>
            <div className="text-[11px] text-ink-3 mt-1.5">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="text-[13px] font-semibold mb-3">Per Cabang</div>
        <p className="text-[12px] text-ink-3">
          Skeleton — Milestone 4. Data per cabang akan ditampilkan setelah upload pertama.
        </p>
      </div>
    </>
  );
}
