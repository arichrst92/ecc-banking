"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Opt = { value: string; label: string };

export function FiskalFilters({
  years,
  currencies,
  branches,
  showBranch,
  showView,
  current,
}: {
  years: number[];
  currencies: string[];
  branches: Opt[];
  showBranch: boolean;
  showView: boolean;
  current: { year: string; currency: string; branch: string; view: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const selCls =
    "form-select text-[13px] py-1.5 min-w-[120px]";

  return (
    <div className="flex flex-wrap items-end gap-3 print-hide">
      <div>
        <label className="form-label">Tahun Fiskal</label>
        <select className={selCls} value={current.year} onChange={(e) => setParam("year", e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label">Mata Uang</label>
        <select className={selCls} value={current.currency} onChange={(e) => setParam("currency", e.target.value)}>
          {currencies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {showBranch && (
        <div>
          <label className="form-label">Cabang</label>
          <select className={selCls + " min-w-[200px]"} value={current.branch} onChange={(e) => setParam("branch", e.target.value)}>
            {branches.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
      )}

      {showView && (
        <div>
          <label className="form-label">Tampilan</label>
          <select className={selCls} value={current.view} onChange={(e) => setParam("view", e.target.value)}>
            <option value="actual">Realisasi (Actual)</option>
            <option value="budget">Anggaran (Budget)</option>
            <option value="compare">Actual vs Budget</option>
          </select>
        </div>
      )}
    </div>
  );
}
