"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string; section?: string; globalOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", section: "Utama" },
  { href: "/upload", label: "Upload Mutasi" },
  { href: "/laporan", label: "Laporan" },
  { href: "/transaksi", label: "Transaksi" },
  { href: "/cabang", label: "Kelola Cabang", section: "Pengaturan", globalOnly: true },
  { href: "/kategori", label: "Kategori", globalOnly: true },
  { href: "/format-profiles", label: "Format Parser", globalOnly: true },
  { href: "/kode-akses", label: "Kode Akses", globalOnly: true },
];

export function Sidebar({ role, branchName }: { role: "global" | "branch"; branchName: string }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => !n.globalOnly || role === "global");

  return (
    <nav className="w-[244px] bg-brand-black min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50">
      <div className="px-[18px] py-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div className="w-[42px] h-[42px] bg-white rounded-xl flex items-center justify-center shrink-0 p-1 shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-ecc.webp" alt="ECC" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] text-brand-yellow tracking-[0.15em] uppercase font-semibold">ECC Global Finance</span>
            <span className="font-serif text-[14px] text-white leading-tight">Keuangan Gereja</span>
          </div>
        </div>
      </div>

      <div className="mx-2.5 mt-2.5 px-3.5 py-2.5 bg-brand-orange/10 border border-brand-orange/25 rounded-xl">
        <div className="text-[9px] uppercase tracking-wider text-white/40 mb-0.5">Sesi aktif</div>
        <div className="text-[13px] font-semibold text-brand-yellow">
          {role === "global" ? "Global Admin" : branchName}
        </div>
        <div className="text-[10px] text-white/45">{role === "global" ? "Semua Cabang" : "Akses cabang"}</div>
      </div>

      <div className="flex-1 py-2.5 overflow-y-auto">
        {items.map((item) => (
          <div key={item.href}>
            {item.section && (
              <div className="px-[18px] pt-2 pb-0.5 text-[9px] uppercase tracking-wider text-white/25">
                {item.section}
              </div>
            )}
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-[18px] py-2.5 text-[13px] font-medium border-l-2 border-transparent transition-colors",
                pathname.startsWith(item.href)
                  ? "text-brand-yellow bg-brand-orange/15 border-l-brand-orange"
                  : "text-white/55 hover:text-white hover:bg-white/[0.04]"
              )}
            >
              {item.label}
            </Link>
          </div>
        ))}
      </div>

      <div className="px-[18px] py-3.5 border-t border-white/[0.07]">
        <form action="/logout" method="post">
          <button
            type="submit"
            className="w-full px-3 py-2 bg-white/[0.05] border border-white/[0.09] rounded-lg text-[12px] text-white/45 hover:bg-bad/15 hover:border-bad/30 hover:text-[#e87c74] transition-colors"
          >
            Keluar
          </button>
        </form>
      </div>
    </nav>
  );
}
