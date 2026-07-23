"use client";

/**
 * Tombol trigger window.print() dari browser.
 * User pilih "Save as PDF" di dialog print → dapat file PDF sesuai filter
 * yang aktif di halaman saat ini (server-rendered dengan searchParams).
 *
 * CSS `@media print` di globals.css yang atur layout printable:
 * - Hide sidebar + form filter + button aksi (.print-hide)
 * - Show blok context ringkasan filter (.print-only)
 * - Flatten card shadow, resize chart, page-break setting untuk table
 */
export function PrintButton({
  label = "Cetak PDF",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className ?? "btn btn-primary"}
      title="Simpan halaman ini sebagai PDF (pilih 'Save as PDF' di dialog print browser)"
    >
      🖨 {label}
    </button>
  );
}
