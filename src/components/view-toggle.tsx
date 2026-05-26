"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./loading-button";
import { toggleViewModeAction } from "@/app/(app)/view-mode-action";

/**
 * Toggle button untuk switch antara native currency dan USD display.
 * Dipasang di topbar / header. Cookie-based, persists cross-page.
 */
export function ViewToggle({ mode }: { mode: "native" | "usd" }) {
  return (
    <form action={toggleViewModeAction}>
      <SubmitButton mode={mode} />
    </form>
  );
}

function SubmitButton({ mode }: { mode: "native" | "usd" }) {
  const { pending } = useFormStatus();
  const isUSD = mode === "usd";
  return (
    <button
      type="submit"
      disabled={pending}
      title={
        isUSD
          ? "Sedang tampil dalam USD (konversi). Klik untuk kembali ke mata uang asli."
          : "Tampil dalam mata uang asli. Klik untuk konversi ke USD."
      }
      aria-busy={pending}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${
        isUSD
          ? "bg-brand-yellow text-brand-black border-brand-yellow hover:bg-brand-yellow-2"
          : "bg-white text-ink-2 border-line hover:border-brand-orange hover:text-brand-orange"
      } disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {pending ? (
        <>
          <Spinner size={11} />
          <span>...</span>
        </>
      ) : isUSD ? (
        <>
          <span>💲</span>
          <span>USD View</span>
        </>
      ) : (
        <>
          <span>🌐</span>
          <span>View in USD</span>
        </>
      )}
    </button>
  );
}
