"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/loading-button";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full px-4 py-3.5 bg-brand-orange text-white font-bold rounded-xl text-[15px] hover:bg-brand-orange-2 transition-colors shadow-lg shadow-brand-orange/30 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <Spinner size={16} />
          <span>Memverifikasi...</span>
        </>
      ) : (
        "Masuk ke Sistem"
      )}
    </button>
  );
}
