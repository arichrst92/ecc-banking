"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "./loading-button";

/**
 * Dropdown cascade Cabang → Tipe Dana → Sub Tipe Dana → Rekening.
 * On change → router.push() ke URL baru dengan filter ter-update +
 * child filter ter-reset.
 *
 * Pakai useTransition supaya page navigation jadi smooth (spinner inline).
 */
export function CascadeSelect({
  name,
  defaultValue,
  options,
  placeholder = "— Semua —",
  resetChildren = [],
  disabled = false,
}: {
  name: string;
  defaultValue: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
  /**
   * Daftar param name yang harus dihapus dari URL saat dropdown ini berubah.
   * Mis. saat branch_id berubah → reset segment_id, sub_id, account_id.
   */
  resetChildren?: string[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newParams = new URLSearchParams(searchParams?.toString() ?? "");
    if (e.target.value) {
      newParams.set(name, e.target.value);
    } else {
      newParams.delete(name);
    }
    // Reset child filters
    for (const child of resetChildren) {
      newParams.delete(child);
    }
    // Reset pagination saat filter berubah
    newParams.delete("page");

    const qs = newParams.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  return (
    <div className="relative">
      <select
        name={name}
        className="form-select"
        defaultValue={defaultValue}
        onChange={handleChange}
        disabled={disabled || isPending}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {isPending && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-orange pointer-events-none">
          <Spinner size={14} />
        </div>
      )}
    </div>
  );
}
