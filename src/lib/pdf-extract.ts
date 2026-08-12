// Ekstraksi teks dari PDF e-statement (yang punya text layer) menjadi CSV.
//
// Kenapa output-nya CSV dan bukan plain text: seluruh pipeline parser yang
// sudah ada bekerja di atas string CSV — generic-engine.ts memanggil
// Papa.parse(content), dan profile-learner.ts mengirim potongan CSV ke LLM
// untuk di-generate schema-nya. Dengan mengubah PDF jadi CSV di lapisan ini,
// format_profiles, hardcoded adapter, dan LLM bootstrap semuanya tetap
// bekerja apa adanya tanpa perlu diubah.
//
// Catatan: modul ini HANYA menangani PDF yang punya text layer, yaitu
// e-statement asli hasil download dari internet banking. PDF hasil scan atau
// foto tidak akan menghasilkan apa-apa dan akan melempar error yang jelas.

import Papa from "papaparse";

/**
 * Toleransi selisih koordinat Y (dalam poin PDF) untuk menganggap dua potongan
 * teks berada di baris yang sama. Perlu > 0 karena angka dan huruf dalam satu
 * baris sering punya baseline yang sedikit berbeda.
 */
const ROW_TOLERANCE = 2.5;

/**
 * Jarak horizontal minimal (dalam poin PDF) yang dianggap sebagai pemisah
 * antar kolom. Di bawah nilai ini, dua potongan teks digabung jadi satu sel.
 * Nilai ini yang paling mungkin perlu disetel ulang per format bank.
 */
const COLUMN_GAP = 8;

interface TextPiece {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Baca PDF dan kembalikan representasi CSV-nya.
 * @throws Error kalau PDF tidak punya text layer yang bisa dibaca.
 */
export async function extractPdfAsCsv(buffer: Buffer): Promise<string> {
  // Dynamic import supaya unpdf tidak ikut ter-bundle di jalur yang tidak
  // memerlukannya (upload CSV biasa tidak menyentuh modul ini sama sekali).
  const { getDocumentProxy } = await import("unpdf");

  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(buffer));
  } catch (e: any) {
    throw new Error(`File PDF tidak bisa dibuka: ${e?.message ?? "format rusak atau terenkripsi"}`);
  }

  const rows: string[][] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const pieces: TextPiece[] = [];
    for (const item of content.items as any[]) {
      const str = typeof item?.str === "string" ? item.str : "";
      if (!str.trim()) continue;
      // item.transform = [a, b, c, d, e, f] — e = x, f = y (origin kiri-bawah)
      pieces.push({
        str,
        x: item.transform[4],
        y: item.transform[5],
        width: typeof item.width === "number" ? item.width : 0,
      });
    }

    rows.push(...groupIntoRows(pieces));
  }

  if (rows.length === 0) {
    throw new Error(
      "PDF ini tidak punya text layer yang bisa dibaca — kemungkinan hasil scan atau foto. " +
        "Gunakan e-statement asli yang di-download dari internet banking."
    );
  }

  return Papa.unparse(rows);
}

/**
 * Kelompokkan potongan teks jadi baris berdasarkan koordinat Y, lalu pecah
 * tiap baris jadi sel berdasarkan jarak horizontal antar potongan.
 */
function groupIntoRows(pieces: TextPiece[]): string[][] {
  if (pieces.length === 0) return [];

  // Koordinat PDF beriorigin di kiri-bawah, jadi Y besar = posisi atas.
  // Urutkan menurun supaya baris keluar dari atas ke bawah.
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);

  const grouped: TextPiece[][] = [];
  for (const piece of sorted) {
    const current = grouped[grouped.length - 1];
    if (current && Math.abs(current[0].y - piece.y) <= ROW_TOLERANCE) {
      current.push(piece);
    } else {
      grouped.push([piece]);
    }
  }

  return grouped.map(splitIntoCells);
}

/**
 * Pecah satu baris jadi sel-sel. Potongan teks yang berdekatan digabung,
 * yang terpisah jauh dianggap kolom berbeda.
 */
function splitIntoCells(row: TextPiece[]): string[] {
  const line = [...row].sort((a, b) => a.x - b.x);

  const cells: string[] = [];
  let buffer = line[0].str;
  let cursor = line[0].x + line[0].width;

  for (let i = 1; i < line.length; i++) {
    const piece = line[i];
    const gap = piece.x - cursor;

    if (gap > COLUMN_GAP) {
      cells.push(buffer.trim());
      buffer = piece.str;
    } else {
      // Gap kecil tapi bukan nol biasanya spasi antar kata dalam sel yang sama.
      buffer += (gap > 0.5 ? " " : "") + piece.str;
    }

    cursor = piece.x + piece.width;
  }

  cells.push(buffer.trim());
  return cells;
}
