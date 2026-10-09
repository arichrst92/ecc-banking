import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
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

const CREAM = "FFF1F0EB";
const NAVY_LT = "FFEAEAF0";
const SUB_LT = "FFF6F5F0";

export async function GET(request: NextRequest) {
  const session = getSession();
  if (!session) return Response.redirect(new URL("/login", request.url));

  const sp = request.nextUrl.searchParams;
  const isGlobal = session.role === "global";

  const rates = await getRates();
  const currencyRaw = (sp.get("currency") ?? "IDR").toUpperCase();
  const displayCurrency = rates[currencyRaw] !== undefined ? currencyRaw : "IDR";
  const numFmt = displayCurrency === "IDR" ? "#,##0" : "#,##0.00";
  const dec = displayCurrency === "IDR" ? 0 : 2;
  const round = (n: number) => (dec ? Math.round(n * 100) / 100 : Math.round(n));
  const monthCell = (n: number) => (Math.abs(n) < 0.005 ? null : round(n));

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

  // ── Build workbook ──
  const wb = new ExcelJS.Workbook();
  wb.creator = "ECC Global Finance";
  wb.created = new Date();
  const ws = wb.addWorksheet(`Fiskal ${year}`);

  const isCompare = view === "compare";
  const dataColCount = isCompare ? 4 : 13; // kolom nilai setelah Account+Description
  const totalCols = 2 + dataColCount;

  // Lebar kolom
  ws.getColumn(1).width = 10; // Account
  ws.getColumn(2).width = 34; // Description
  for (let i = 3; i <= totalCols; i++) ws.getColumn(i).width = isCompare ? 16 : 13;

  // Format angka per kolom nilai
  for (let i = 3; i <= totalCols; i++) {
    ws.getColumn(i).numFmt = isCompare && i === totalCols ? "0" : numFmt; // kolom % di compare
  }

  // Judul
  const title = ws.addRow([`ECC — Laporan Fiskal ${year}`]);
  title.font = { bold: true, size: 14 };
  ws.mergeCells(title.number, 1, title.number, totalCols);
  ws.addRow([`Cabang: ${branchLabel}`]).font = { bold: true };
  ws.addRow([`Mata Uang: ${displayCurrency}`, `Tampilan: ${VIEW_LABEL[view]}`]);
  ws.addRow([`Diekspor: ${new Date().toLocaleString("id-ID")}`]).font = { italic: true, color: { argb: "FF8A8A8A" }, size: 9 };
  ws.addRow([]);

  const summary = ws.addRow(["Total Revenue", round(revTotal), "Total Expenses", round(expTotal), "Surplus/(Defisit)", round(netTotal)]);
  summary.font = { bold: true };
  summary.getCell(2).numFmt = numFmt;
  summary.getCell(4).numFmt = numFmt;
  summary.getCell(6).numFmt = numFmt;
  ws.addRow([]);

  // Header tabel
  const header = ws.addRow(
    isCompare
      ? ["Account", "Account Description", "Actual", "Budget", "Variance", "%"]
      : ["Account", "Account Description", ...MONTHS, "Total"]
  );
  const headerRowNo = header.number;
  header.eachCell((c, colNumber) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
    c.alignment = { horizontal: colNumber > 2 ? "right" : "left" };
    c.border = { bottom: { style: "thin", color: { argb: "FFBBBBBB" } } };
  });

  const styleGroup = (r: ExcelJS.Row) => {
    r.font = { bold: true, color: { argb: "FF1A1A1A" } };
    for (let i = 1; i <= totalCols; i++) {
      r.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_LT } };
    }
  };
  const styleSubtotal = (r: ExcelJS.Row) => {
    r.font = { bold: true };
    for (let i = 1; i <= totalCols; i++) {
      r.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB_LT } };
      r.getCell(i).border = { top: { style: "thin", color: { argb: "FFDDDDDD" } } };
    }
  };

  if (isCompare) {
    for (const blk of blocks) {
      styleGroup(ws.addRow([blk.name]));
      for (const c of blk.cats) {
        const a = sum(actual.get(c.id));
        const b = sum(budget.get(c.id));
        const v = a - b;
        const pct = b !== 0 ? (a / b) * 100 : a !== 0 ? 100 : 0;
        ws.addRow([c.account_code ?? "", c.name, round(a), round(b), round(v), Math.round(pct)]);
      }
    }
  } else {
    for (const blk of blocks) {
      styleGroup(ws.addRow([blk.name]));
      const sub = new Array(12).fill(0);
      for (const c of blk.cats) {
        const row = matrix.get(c.id) ?? new Array(12).fill(0);
        for (let i = 0; i < 12; i++) sub[i] += row[i];
        ws.addRow([c.account_code ?? "", c.name, ...row.map(monthCell), round(sum(row))]);
      }
      styleSubtotal(ws.addRow(["", `Subtotal ${blk.name}`, ...sub.map((v) => round(v)), round(sum(sub))]));
    }
    const netRow = ws.addRow(["", "NET SURPLUS / (DEFICIT)", ...net.map((v) => round(v)), round(sum(net))]);
    netRow.font = { bold: true };
    for (let i = 1; i <= totalCols; i++) {
      netRow.getCell(i).border = { top: { style: "double", color: { argb: "FF999999" } } };
    }
  }

  // Freeze: 2 kolom pertama + semua baris sampai header tabel
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowNo }];

  const buf = await wb.xlsx.writeBuffer();
  const filename = `Laporan-Fiskal-${year}-${slug(branchLabel)}-${displayCurrency}-${view}.xlsx`;

  return new Response(new Uint8Array(buf as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
