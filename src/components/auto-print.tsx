"use client";

import { useEffect, useRef } from "react";

/**
 * Trigger window.print() otomatis setelah halaman render selesai.
 * Dipakai di halaman yang URL-nya include `?print=1` — biasanya user
 * di-navigate ke sini dari tombol "Cetak Semua" yang dulu di halaman
 * pagination. Server render semua row (tanpa LIMIT), lalu client
 * langsung buka dialog print.
 *
 * useRef untuk memastikan print() cuma dipanggil sekali dalam StrictMode
 * (React 18 development mount + unmount + mount lagi).
 */
export function AutoPrint({ delayMs = 500 }: { delayMs?: number }) {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    const t = setTimeout(() => {
      window.print();
    }, delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  return null;
}
