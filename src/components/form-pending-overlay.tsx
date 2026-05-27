"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./loading-button";

/**
 * Full-page overlay yang muncul saat <form> server action sedang pending.
 * WAJIB di-render di DALAM <form> supaya useFormStatus bisa baca state-nya.
 *
 * Use case: action yang memakan waktu lama (LLM bootstrap, upload large file)
 * — user butuh feedback yang lebih jelas dari sekedar spinner di tombol.
 */
export function FormPendingOverlay({
  title = "Memproses...",
  subtitle,
  steps,
  estimate,
}: {
  title?: string;
  subtitle?: string;
  steps?: string[];
  estimate?: string;
}) {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
        <div className="text-brand-orange">
          <Spinner size={48} />
        </div>
        <div>
          <h2 className="font-serif text-[20px] text-navy mb-2">{title}</h2>
          {subtitle && (
            <p className="text-[13px] text-ink-2 leading-relaxed">{subtitle}</p>
          )}
          {steps && steps.length > 0 && (
            <>
              <p className="text-[13px] text-ink-2 leading-relaxed">Sistem sedang:</p>
              <ul className="text-[12px] text-ink-3 mt-2 space-y-1">
                {steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {estimate && (
            <p className="text-[11px] text-ink-3 mt-3 italic">{estimate}</p>
          )}
        </div>
      </div>
    </div>
  );
}
