import type { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { getSession } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { getRates } from "@/lib/exchange-rate";
import { FISCAL_MONTHS as MONTHS, computeFiscalMatrix } from "@/lib/fiscal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VIEW_LABEL: Record<string, string> = {
  actual: "Realisasi (Actual)",
  budget: "Anggaran (Budget)",
  compare: "Actual vs Budget",
};

function slug(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "data";
}

type Col = { w: number; align: "left" | "right" };

export async function GET(request: NextRequest) {
  const session = getSession();
  if (!session) return Response.redirect(new URL("/login", request.url));

  const sp = request.nextUrl.searchParams;
  const isGlobal = session.role === "global";

  const rates = await getRates();
  const currencyRaw = (sp.get("currency") ?? "IDR").toUpperCase();
  const displayCurrency = rates[currencyRaw] !== undefined ? currencyRaw : "IDR";
  const dec = displayCurrency === "IDR" ? 0 : 2;
  const nf = new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const num = (n: number) => nf.format(dec ? Math.round(n * 100) / 100 : Math.round(n));
  const monthTxt = (n: number) => (Math.abs(n) < 0.005 ? "" : num(n));

  const year = Number(sp.get("year")) || new Date().getFullYear();
  const view = (["actual", "budget", "compare"].includes(sp.get("view") ?? "") ? sp.get("view") : "actual") as
    | "actual"
    | "budget"
    | "compare";

  const branchParam = sp.get("branch") ?? "all";
  const filterBranchId = isGlobal ? (branchParam === "all" ? null : Number(branchParam) || null) : session.branchId ?? null;

  let branchLabel = "Konsolidasi — Semua Cabang";
  if (filterBranchId) {
    const b = await queryOne<{ name: string; code: string }>(`SELECT name, code FROM branches WHERE id = $1`, [filterBranchId]);
    branchLabel = b ? `${b.name} (${b.code})` : "Cabang";
  } else if (!isGlobal) {
    branchLabel = "Cabang Anda";
  }

  const { actual, budget, blocks } = await computeFiscalMatrix({ year, filterBranchId, displayCurrency, rates });
  const matrix = view === "budget" ? budget : actual;
  const sum = (a: number[] | undefined) => (a ? a.reduce((s, x) => s + x, 0) : 0);
  const sign = (k: string) => (k === "expense" ? -1 : 1);

  let revTotal = 0;
  let expTotal = 0;
  const net = new Array(12).fill(0);
  for (const blk of blocks) {
    for (const c of blk.cats) {
      const row = matrix.get(c.id);
      if (!row) continue;
      for (let i = 0; i < 12; i++) net[i] += sign(blk.kind) * row[i];
      const t = sum(row);
      if (blk.kind === "revenue") revTotal += t;
      else if (blk.kind === "expense") expTotal += t;
    }
  }
  const netTotal = revTotal - expTotal;

  const isCompare = view === "compare";

  // ── Columns ──
  const cols: Col[] = isCompare
    ? [{ w: 60, align: "left" }, { w: 250, align: "left" }, { w: 140, align: "right" }, { w: 140, align: "right" }, { w: 140, align: "right" }, { w: 56, align: "right" }]
    : [{ w: 42, align: "left" }, { w: 158, align: "left" }, ...MONTHS.map(() => ({ w: 44, align: "right" as const })), { w: 58, align: "right" }];

  const M = 28;
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: M, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const usableW = pageW - M * 2;
  const xs: number[] = [];
  let acc = M;
  for (const c of cols) {
    xs.push(acc);
    acc += c.w;
  }
  const rowH = 13;
  const bottomLimit = pageH - 46; // sisakan ruang footer

  const PAD = 3;
  function drawRow(vals: string[], o: { bold?: boolean; fill?: string; color?: string } = {}, y?: number) {
    const yy = y ?? doc.y;
    if (o.fill) doc.rect(M, yy - 1, usableW, rowH).fill(o.fill);
    doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(6.5).fillColor(o.color ?? "#1a1a1a");
    for (let i = 0; i < cols.length; i++) {
      let t = vals[i] ?? "";
      const w = cols[i].w - PAD * 2;
      // truncate kalau kepanjangan
      if (t && doc.widthOfString(t) > w) {
        while (t.length > 1 && doc.widthOfString(t + "…") > w) t = t.slice(0, -1);
        t = t + "…";
      }
      doc.text(t, xs[i] + PAD, yy + 2, { width: w, align: cols[i].align, lineBreak: false });
    }
    doc.y = yy + rowH;
  }

  const header = isCompare
    ? ["Account", "Account Description", "Actual", "Budget", "Variance", "%"]
    : ["Account", "Account Description", ...MONTHS, "Total"];

  function drawHeader() {
    drawRow(header, { bold: true, fill: "#f1f0eb", color: "#1a1a1a" });
    doc.moveTo(M, doc.y - 1).lineTo(M + usableW, doc.y - 1).lineWidth(0.5).strokeColor("#bbbbbb").stroke();
  }
  function ensureSpace() {
    if (doc.y + rowH > bottomLimit) {
      doc.addPage();
      drawHeader();
    }
  }

  // ── Header dokumen ──
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#1a1a1a").text(`ECC — Laporan Fiskal ${year}`, M, M);
  doc.font("Helvetica").fontSize(9).fillColor("#4a4a4a")
    .text(`${branchLabel}  ·  ${displayCurrency}  ·  ${VIEW_LABEL[view]}`, M, doc.y + 2);
  doc.fontSize(7.5).fillColor("#8a8a8a").text(`Diekspor: ${new Date().toLocaleString("id-ID")}`, M, doc.y + 1);

  // Ringkasan
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1a1a1a");
  const sy = doc.y;
  doc.fillColor("#2e7d6e").text(`Total Revenue: ${displayCurrency} ${num(revTotal)}`, M, sy, { continued: false });
  doc.fillColor("#c0392b").text(`Total Expenses: ${displayCurrency} ${num(expTotal)}`, M + 240, sy);
  doc.fillColor(netTotal >= 0 ? "#2e7d6e" : "#c0392b").text(`${netTotal >= 0 ? "Surplus" : "Defisit"}: ${displayCurrency} ${num(netTotal)}`, M + 490, sy);
  doc.fillColor("#1a1a1a");
  doc.moveDown(0.6);

  drawHeader();

  // ── Baris data ──
  if (isCompare) {
    for (const blk of blocks) {
      ensureSpace();
      drawRow([blk.name.toUpperCase(), "", "", "", "", ""], { bold: true, fill: "#eaeaf0", color: "#1a1a1a" });
      for (const c of blk.cats) {
        ensureSpace();
        const a = sum(actual.get(c.id));
        const b = sum(budget.get(c.id));
        const v = a - b;
        const pct = b !== 0 ? (a / b) * 100 : a !== 0 ? 100 : 0;
        drawRow([c.account_code ?? "", c.name, a ? num(a) : "", b ? num(b) : "", v ? num(v) : "", b || a ? Math.round(pct) + "%" : ""]);
      }
    }
  } else {
    for (const blk of blocks) {
      ensureSpace();
      drawRow([blk.name.toUpperCase(), ...new Array(13).fill("")], { bold: true, fill: "#eaeaf0", color: "#1a1a1a" });
      const subA = new Array(12).fill(0);
      for (const c of blk.cats) {
        ensureSpace();
        const row = matrix.get(c.id) ?? new Array(12).fill(0);
        for (let i = 0; i < 12; i++) subA[i] += row[i];
        drawRow([c.account_code ?? "", c.name, ...row.map(monthTxt), num(sum(row))]);
      }
      ensureSpace();
      drawRow(["", `Subtotal ${blk.name}`, ...subA.map((v) => num(v)), num(sum(subA))], { bold: true, fill: "#f6f5f0" });
    }
    ensureSpace();
    drawRow(["", "NET SURPLUS / (DEFICIT)", ...net.map((v) => num(v)), num(sum(net))], { bold: true, fill: "#f1f0eb" });
  }

  // ── Footer "Powered by IDEA" + nomor halaman di semua halaman ──
  let logo: Buffer | null = null;
  try {
    logo = readFileSync(join(process.cwd(), "public", "images", "logo-idea.png"));
  } catch {
    logo = null;
  }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // cegah pdfkit nambah halaman kosong saat tulis footer
    const fy = pageH - 30;
    doc.font("Helvetica").fontSize(7.5).fillColor("#8a8a8a").text("Powered by", M, fy, { lineBreak: false });
    const txtW = doc.widthOfString("Powered by");
    if (logo) {
      try {
        doc.image(logo, M + txtW + 6, fy - 2, { height: 11 });
      } catch {
        doc.font("Helvetica-Bold").fillColor("#4a4a4a").text("IDEA", M + txtW + 6, fy, { lineBreak: false });
      }
    } else {
      doc.font("Helvetica-Bold").fillColor("#4a4a4a").text("IDEA", M + txtW + 6, fy, { lineBreak: false });
    }
    doc.font("Helvetica").fontSize(7.5).fillColor("#8a8a8a")
      .text(`Halaman ${i + 1} dari ${range.count}`, pageW - M - 120, fy, { width: 120, align: "right", lineBreak: false });
  }

  doc.end();
  const buf = await done;
  const filename = `Laporan-Fiskal-${year}-${slug(branchLabel)}-${displayCurrency}-${view}.pdf`;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
