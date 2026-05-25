// Global loading state untuk route segment (app)/*.
// Next.js otomatis render ini saat navigasi server component sedang fetch data.

import { Spinner } from "@/components/loading-button";

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-ink-3">
        <div className="text-brand-orange">
          <Spinner size={40} />
        </div>
        <p className="text-[13px]">Memuat...</p>
      </div>
    </div>
  );
}
