import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
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
  const numFmt = displayCurrency === "IDR" ? "#,##0" : "#,##0.00";
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "ECC Global Finance";

  // ── Sheet 1: Statement of Activity ──
  const soa = wb.addWorksheet("Statement of Activity");
  soa.getColumn(1).width = 12;
  soa.getColumn(2).width = 40;
  soa.getColumn(3).width = 20;
  soa.getColumn(3).numFmt = numFmt;
  const t1 = soa.addRow([`ECC — Statement of Activity`]);
  t1.font = { bold: true, size: 14 };
  soa.addRow([`${d.monthName} ${year}`]).font = { bold: true };
  soa.addRow([`${branchLabel} · ${displayCurrency}`]).font = { italic: true, color: { argb: "FF8A8A8A" } };
  soa.addRow([]);
  for (const blk of d.soaBlocks) {
    const h = soa.addRow([blk.name, "", ""]);
    h.font = { bold: true };
    h.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAEAF0" } };
    for (const c of blk.cats) soa.addRow([c.code ?? "", c.name, c.total]);
    const sub = soa.addRow(["", `Total ${blk.name}`, blk.subtotal]);
    sub.font = { bold: true };
    sub.getCell(3).numFmt = numFmt;
  }
  soa.addRow([]);
  const netRow = soa.addRow(["", "Net: Income Gain / (Loss)", d.net]);
  netRow.font = { bold: true, size: 12 };
  netRow.getCell(3).numFmt = numFmt;

  // ── Sheet 2: General Ledger ──
  const gl = wb.addWorksheet("General Ledger");
  gl.getColumn(1).width = 14;
  gl.getColumn(2).width = 44;
  gl.getColumn(3).width = 16;
  gl.getColumn(4).width = 16;
  gl.getColumn(5).width = 16;
  [3, 4, 5].forEach((i) => (gl.getColumn(i).numFmt = numFmt));
  const g1 = gl.addRow([`ECC — General Ledger`]);
  g1.font = { bold: true, size: 14 };
  gl.addRow([`${d.monthName} ${year} · ${branchLabel} · ${displayCurrency}`]).font = { italic: true, color: { argb: "FF8A8A8A" } };
  gl.addRow([]);
  for (const acc of d.ledger) {
    const head = gl.addRow([acc.code ?? "", acc.name]);
    head.font = { bold: true };
    head.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F4" } };
    head.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F4" } };
    const colHead = gl.addRow(["Tanggal", "Item Description", "Expenses", "Income", "Balance"]);
    colHead.font = { bold: true };
    colHead.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F0EB" } }));
    for (const t of acc.txns) gl.addRow([t.date, t.desc, t.expense || null, t.income || null, t.balance]);
    const tot = gl.addRow(["", "Total", acc.totExpense, acc.totIncome, acc.totIncome - acc.totExpense]);
    tot.font = { bold: true };
    gl.addRow([]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `Detail-Fiskal-${year}-${String(month).padStart(2, "0")}-${slug(branchLabel)}-${displayCurrency}.xlsx`;
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
