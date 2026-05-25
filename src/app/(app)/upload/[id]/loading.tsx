// Loading khusus untuk preview upload — biasanya lebih lambat
// karena re-parse file + AI categorization.

import { Spinner } from "@/components/loading-button";

export default function UploadPreviewLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="text-brand-orange">
          <Spinner size={48} />
        </div>
        <div>
          <h2 className="font-serif text-[20px] text-navy mb-2">Memproses File Mutasi</h2>
          <p className="text-[13px] text-ink-2 leading-relaxed">
            Sistem sedang:
          </p>
          <ul className="text-[12px] text-ink-3 mt-2 space-y-1">
            <li>📄 Re-parse file mutasi</li>
            <li>🤖 Klasifikasi kategori per transaksi (AI)</li>
            <li>💾 Cache hasil supaya confirm instant</li>
          </ul>
          <p className="text-[11px] text-ink-3 mt-3 italic">
            Estimasi 5–20 detik tergantung jumlah transaksi dan apakah format sudah dikenal.
          </p>
        </div>
      </div>
    </div>
  );
}
