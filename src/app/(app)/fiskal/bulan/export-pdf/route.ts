import type { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { getSession } from "@/lib/session";
import { queryOne } from "@/lib/db";
import { getRates } from "@/lib/exchange-rate";
import { computeMonthDetail } from "@/lib/fiscal-month";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function slug(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "data";
}

export async function GET(request: NextRequest) {
  const session = getSession();
  if (!session) return Response.redirect(new URL("/login", request.url));

  const sp = request.nextUrl.searchParams;
  const isGlobal = session.role === "global";
  const rates = await getRates();
  const currency = (sp.get("currency") ?? "IDR").toUpperCase();
  const displayCurrency = rates[currency] !== undefined ? currency : "IDR";
  const dec = displayCurrency === "IDR" ? 0 : 2;
  const nf = new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const money = (n: number) => nf.format(dec ? Math.round(n * 100) / 100 : Math.round(n));
  const cell = (n: number) => (Math.abs(n) < 0.005 ? "-" : money(n));

  const year = Number(sp.get("year")) || new Date().getFullYear();
  const month = Math.min(12, Math.max(1, Number(sp.get("month")) || 1));
  const branchParam = sp.get("branch") ?? "all";
  const filterBranchId = isGlobal ? (branchParam === "all" ? null : Number(branchParam) || null) : session.branchId ?? null;

  let branchLabel = "Konsolidasi — Semua Cabang";
  if (filterBranchId) {
    const b = await queryOne<{ name: string; code: string }>(`SELECT name, code FROM branches WHERE id=$1`, [filterBranchId]);
    branchLabel = b ? `${b.name} (${b.code})` : "Cabang";
  } else if (!isGlobal) branchLabel = "Cabang Anda";

  const d = await computeMonthDetail({ year, month, filterBranchId, displayCurrency, rates });

  const M = 32;
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const pageW = doc.page.width, pageH = doc.page.height, usableW = pageW - 2 * M;
  const bottomLimit = pageH - 52;

  function ensure(h: number) { if (doc.y + h > bottomLimit) doc.addPage(); }
  function row(colW: number[], align: ("left" | "right")[], vals: string[], o: { bold?: boolean; fill?: string; color?: string } = {}) {
    const rowH = 14, yy = doc.y;
    if (o.fill) doc.rect(M, yy - 1, usableW, rowH).fill(o.fill);
    doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(o.color ?? "#1a1a1a");
    let x = M;
    for (let i = 0; i < colW.length; i++) {
      let t = vals[i] ?? "";
      const w = colW[i] - 6;
      if (t && doc.widthOfString(t) > w) { while (t.length > 1 && doc.widthOfString(t + "…") > w) t = t.slice(0, -1); t += "…"; }
      doc.text(t, x + 3, yy + 3, { width: w, align: align[i], lineBreak: false });
      x += colW[i];
    }
    doc.y = yy + rowH;
  }
  function tableHeaderFactory(colW: number[], align: ("left" | "right")[], headers: string[]) {
    return () => row(colW, align, headers, { bold: true, fill: "#f1f0eb" });
  }

  // ── Header dokumen ──
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a1a1a").text("ECC Global Finance", M, M);
  doc.font("Helvetica").fontSize(10).fillColor("#4a4a4a").text("Detail Fiskal — Statement of Activity & General Ledger", M, doc.y + 1);
  doc.fontSize(8.5).fillColor("#1a1a1a").text(`${d.monthName} ${year}  ·  ${branchLabel}  ·  ${displayCurrency}`, M, doc.y + 2);
  doc.fontSize(7.5).fillColor("#8a8a8a").text(`Diekspor: ${new Date().toLocaleString("id-ID")}`, M, doc.y + 1);
  doc.moveDown(0.6);

  // ── Statement of Activity ──
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a1a").text("Statement of Activity", M, doc.y + 2);
  doc.moveDown(0.2);
  const soaW = [70, usableW - 180, 110];
  const soaA: ("left" | "right")[] = ["left", "left", "right"];
  for (const blk of d.soaBlocks) {
    ensure(28);
    row(soaW, soaA, [blk.name.toUpperCase(), "", ""], { bold: true, fill: "#eaeaf0" });
    for (const c of blk.cats) { ensure(14); row(soaW, soaA, [c.code ?? "", c.name, cell(c.total)]); }
    ensure(14);
    row(soaW, soaA, ["", `Total ${blk.name}`, money(blk.subtotal)], { bold: true, fill: "#f6f5f0" });
  }
  ensure(16);
  row(soaW, soaA, ["", "Net: Income Gain / (Loss)", money(d.net)], { bold: true, fill: "#e8efe6" });
  doc.moveDown(0.8);

  // ── General Ledger ──
  ensure(24);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a1a").text("General Ledger", M, doc.y + 2);
  doc.moveDown(0.2);
  const glW = [70, usableW - 340, 90, 90, 90];
  const glA: ("left" | "right")[] = ["left", "left", "right", "right", "right"];
  const glHeaders = ["Tanggal", "Item Description", "Expenses", "Income", "Balance"];
  for (const acc of d.ledger) {
    ensure(42);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#13306b").text(`${acc.code ?? ""}  ${acc.name}`, M, doc.y + 4);
    doc.moveDown(0.1);
    const header = tableHeaderFactory(glW, glA, glHeaders);
    ensure(28); header();
    if (acc.txns.length === 0) {
      row(glW, glA, ["", "— tidak ada transaksi —", "", "", ""], { color: "#8a8a8a" });
    } else {
      for (const t of acc.txns) {
        if (doc.y + 14 > bottomLimit) { doc.addPage(); header(); }
        row(glW, glA, [t.date, t.desc, t.expense ? money(t.expense) : "", t.income ? money(t.income) : "", money(t.balance)]);
      }
    }
    if (doc.y + 14 > bottomLimit) { doc.addPage(); header(); }
    row(glW, glA, ["", "Total", cell(acc.totExpense), cell(acc.totIncome), cell(acc.totIncome - acc.totExpense)], { bold: true, fill: "#f6f5f0" });
    doc.moveDown(0.5);
  }

  // ── Footer Powered by IDEA ──
  let logo: Buffer | null = null;
  try { logo = readFileSync(join(process.cwd(), "public", "images", "logo-idea.png")); } catch { logo = null; }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const fy = pageH - 32;
    doc.font("Helvetica").fontSize(7.5).fillColor("#8a8a8a").text("Powered by", M, fy, { lineBreak: false });
    const tw = doc.widthOfString("Powered by");
    if (logo) { try { doc.image(logo, M + tw + 6, fy - 2, { height: 11 }); } catch { doc.font("Helvetica-Bold").fillColor("#4a4a4a").text("IDEA", M + tw + 6, fy, { lineBreak: false }); } }
    else { doc.font("Helvetica-Bold").fillColor("#4a4a4a").text("IDEA", M + tw + 6, fy, { lineBreak: false }); }
    doc.font("Helvetica").fontSize(7.5).fillColor("#8a8a8a").text(`Halaman ${i + 1} dari ${range.count}`, pageW - M - 120, fy, { width: 120, align: "right", lineBreak: false });
  }

  doc.end();
  const buf = await done;
  const filename = `Detail-Fiskal-${year}-${String(month).padStart(2, "0")}-${slug(branchLabel)}-${displayCurrency}.pdf`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
