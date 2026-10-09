"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type IconName =
  | "dashboard" | "upload" | "laporan" | "fiskal" | "transaksi"
  | "settings" | "account" | "logout"
  | "cabang" | "kategori" | "kurs" | "format" | "kode";

function Icon({ name, className }: { name: IconName; className?: string }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true } as const;
  switch (name) {
    case "dashboard":
      return (<svg {...common}><path {...p} d="M3 11l9-8 9 8" /><path {...p} d="M5 10v10h14V10" /></svg>);
    case "upload":
      return (<svg {...common}><path {...p} d="M12 15V3" /><path {...p} d="M7 8l5-5 5 5" /><path {...p} d="M4 17v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>);
    case "laporan":
      return (<svg {...common}><path {...p} d="M4 20V10" /><path {...p} d="M10 20V4" /><path {...p} d="M16 20v-7" /><path {...p} d="M21 20H3" /></svg>);
    case "fiskal":
      return (<svg {...common}><rect {...p} x="3" y="4" width="18" height="16" rx="1.5" /><path {...p} d="M3 9h18M3 14h18M9 4v16" /></svg>);
    case "transaksi":
      return (<svg {...common}><path {...p} d="M8 6h13M8 12h13M8 18h13" /><path {...p} d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>);
    case "settings":
      return (<svg {...common}><circle {...p} cx="12" cy="12" r="3" /><path {...p} d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>);
    case "account":
      return (<svg {...common}><path {...p} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle {...p} cx="12" cy="7" r="4" /></svg>);
    case "logout":
      return (<svg {...common}><path {...p} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path {...p} d="M16 17l5-5-5-5" /><path {...p} d="M21 12H9" /></svg>);
    case "cabang":
      return (<svg {...common}><rect {...p} x="4" y="3" width="16" height="18" rx="1.5" /><path {...p} d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></svg>);
    case "kategori":
      return (<svg {...common}><path {...p} d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><circle {...p} cx="7" cy="7" r="1.3" /></svg>);
    case "kurs":
      return (<svg {...common}><path {...p} d="M12 1.5v21" /><path {...p} d="M17 5.5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>);
    case "format":
      return (<svg {...common}><path {...p} d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1" /><path {...p} d="M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 01-2 2h-1" /></svg>);
    case "kode":
      return (<svg {...common}><circle {...p} cx="7.5" cy="15.5" r="3.5" /><path {...p} d="M10 13l9-9M18 5l2 2M15 8l2 2" /></svg>);
  }
}

type Item = { href: string; label: string; icon: IconName };

const MAIN: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/laporan", label: "Keuangan", icon: "laporan" },
  { href: "/fiskal", label: "Fiskal", icon: "fiskal" },
  { href: "/transaksi", label: "Transaksi", icon: "transaksi" },
];

const SETTINGS: Item[] = [
  { href: "/cabang", label: "Kelola Cabang", icon: "cabang" },
  { href: "/kategori", label: "Kategori", icon: "kategori" },
  { href: "/kurs", label: "Mata Uang & Kurs", icon: "kurs" },
  { href: "/format-profiles", label: "Format Parser", icon: "format" },
  { href: "/kode-akses", label: "Kode Akses", icon: "kode" },
];

export function BottomNav({ role, branchName }: { role: "global" | "branch"; branchName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<"settings" | "account" | null>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const settingsActive = SETTINGS.some((s) => isActive(s.href));

  const itemCls = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 min-w-[48px] shrink-0 transition-colors",
      active ? "text-brand-yellow bg-brand-orange/20" : "text-white/55 hover:text-white hover:bg-white/10"
    );

  return (
    <>
      {open && (
        <button
          aria-label="Tutup menu"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setOpen(null)}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none print-hide">
        <div className="mx-auto mb-3 w-fit max-w-[calc(100%-12px)] pointer-events-auto">
          <nav className="relative flex items-stretch gap-0.5 rounded-2xl border border-white/10 bg-brand-black/95 px-1.5 py-1.5 shadow-2xl backdrop-blur-md overflow-x-auto no-scrollbar">
            {/* Logo ECC */}
            <Link href="/dashboard" aria-label="ECC Global Finance" onClick={() => setOpen(null)} className="flex shrink-0 items-center self-center pl-1 pr-1.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/logo-ecc.webp" alt="ECC" className="max-h-full max-w-full object-contain" />
              </span>
            </Link>
            <div className="mx-0.5 w-px shrink-0 self-stretch bg-white/10" />

            {MAIN.map((it) => (
              <Link key={it.href} href={it.href} className={itemCls(isActive(it.href))} onClick={() => setOpen(null)}>
                <Icon name={it.icon} className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-none">{it.label}</span>
              </Link>
            ))}

            {role === "global" && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  className={itemCls(settingsActive || open === "settings")}
                  onClick={() => setOpen(open === "settings" ? null : "settings")}
                  aria-expanded={open === "settings"}
                >
                  <Icon name="settings" className="w-5 h-5" />
                  <span className="text-[9px] font-medium leading-none">Pengaturan</span>
                </button>
                {open === "settings" && (
                  <div className="absolute bottom-[calc(100%+10px)] right-0 w-56 rounded-xl border border-line bg-white p-1.5 shadow-2xl">
                    <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-ink-3">Pengaturan</div>
                    {SETTINGS.map((s) => (
                      <Link
                        key={s.href}
                        href={s.href}
                        onClick={() => setOpen(null)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                          isActive(s.href) ? "bg-brand-orange/10 text-brand-orange font-medium" : "text-ink hover:bg-cream-2"
                        )}
                      >
                        <Icon name={s.icon} className="w-[18px] h-[18px]" />
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mx-0.5 w-px shrink-0 self-stretch bg-white/10" />

            <div className="relative shrink-0">
              <button
                type="button"
                className={itemCls(open === "account")}
                onClick={() => setOpen(open === "account" ? null : "account")}
                aria-expanded={open === "account"}
              >
                <Icon name="account" className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-none">Akun</span>
              </button>
              {open === "account" && (
                <div className="absolute bottom-[calc(100%+10px)] right-0 w-56 rounded-xl border border-line bg-white p-1.5 shadow-2xl">
                  <div className="px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-wider text-ink-3">Sesi aktif</div>
                    <div className="text-[13px] font-semibold text-navy">{role === "global" ? "Global Admin" : branchName}</div>
                    <div className="text-[11px] text-ink-3">{role === "global" ? "Semua Cabang" : "Akses cabang"}</div>
                  </div>
                  <form action="/logout" method="post" className="px-1 pb-1">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[#c0392b] hover:bg-bad/10"
                    >
                      <Icon name="logout" className="w-[18px] h-[18px]" />
                      Keluar
                    </button>
                  </form>
                </div>
              )}
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
