import type { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { getSession } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import { buildTxWhere } from "@/lib/hierarchy";
import { getViewMode } from "@/lib/view-mode";
import { getRates, convertToUSD, toNumber } from "@/lib/exchange-rate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function defaultPeriod() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { from: fmt(from), to: fmt(to) };
}

type Agg = { currency: string; total_in: string; total_out: string; tx_count: number };
type CatAgg = Agg & { name: string };
type SegAgg = Agg & { branch_name: string; segment_name: string };
type Block = {
  currency: string;
  totIn: number;
  totOut: number;
  count: number;
  cats: { name: string; in: number; out: number; count: number }[];
  segs: { branch: string; segment: string; in: number; out: number; count: number }[];
};

export async function GET(request: NextRequest) {
  const session = getSession();
  if (!session) return Response.redirect(new URL("/login", request.url));

  const sp = request.nextUrl.searchParams;
  const isGlobal = session.role === "global";

  const period = {
    from: sp.get("from") || defaultPeriod().from,
    to: sp.get("to") || defaultPeriod().to,
  };
  const filterBranchId = isGlobal ? (sp.get("branch_id") ? Number(sp.get("branch_id")) : null) : session.branchId ?? null;
  const filterSegmentId = sp.get("segment_id") ? Number(sp.get("segment_id")) : null;
  const filterSubId = sp.get("sub_id") ? Number(sp.get("sub_id")) : null;
  const filterAccountId = sp.get("account_id") ? Number(sp.get("account_id")) : null;

  const whereParts = [`t.tx_date BETWEEN $1 AND $2`, `t.archived_at IS NULL`];
  const params: unknown[] = [period.from, period.to];
  const hier = buildTxWhere(
    { branchId: filterBranchId ?? undefined, segmentId: filterSegmentId ?? undefined, subId: filterSubId ?? undefined, accountId: filterAccountId ?? undefined },
    params.length + 1
  );
  whereParts.push(...hier.whereParts);
  params.push(...hier.params);
  const whereSql = whereParts.join(" AND ");

  const summary = await query<Agg>(
    `SELECT t.currency, COALESCE(SUM(t.credit),0)::TEXT AS total_in, COALESCE(SUM(t.debit),0)::TEXT AS total_out, COUNT(*)::INT AS tx_count
       FROM transactions t WHERE ${whereSql} GROUP BY t.currency ORDER BY t.currency`,
    params
  );
  const byCat = await query<CatAgg>(
    `SELECT c.name, t.currency, COALESCE(SUM(t.credit),0)::TEXT AS total_in, COALESCE(SUM(t.debit),0)::TEXT AS total_out, COUNT(*)::INT AS tx_count
       FROM transactions t JOIN categories c ON c.id = t.category_id WHERE ${whereSql}
      GROUP BY c.name, t.currency ORDER BY t.currency, (SUM(t.debit)+SUM(t.credit)) DESC`,
    params
  );
  const bySeg = await query<SegAgg>(
    `SELECT b.name AS branch_name, s.name AS segment_name, t.currency,
            COALESCE(SUM(t.credit),0)::TEXT AS total_in, COALESCE(SUM(t.debit),0)::TEXT AS total_out, COUNT(*)::INT AS tx_count
       FROM transactions t JOIN accounts a ON a.id=t.account_id JOIN sub_segments ss ON ss.id=a.sub_segment_id
       JOIN segments s ON s.id=ss.segment_id JOIN branches b ON b.id=t.branch_id WHERE ${whereSql}
      GROUP BY b.name, s.name, t.currency ORDER BY b.name, s.name`,
    params
  );

  const viewMode = getViewMode();
  const rates = viewMode === "usd" ? await getRates() : {};
  const toDisp = (amt: string | number, cur: string) => {
    if (viewMode !== "usd") return toNumber(amt);
    const usd = convertToUSD(toNumber(amt), cur, rates);
    return usd ?? toNumber(amt);
  };

  // Susun blocks: native = per currency; usd = 1 blok gabungan
  const blocks: Block[] = [];
  if (viewMode === "usd") {
    const catMap = new Map<string, { in: number; out: number; count: number }>();
    const segMap = new Map<string, { branch: string; segment: string; in: number; out: number; count: number }>();
    let totIn = 0, totOut = 0, count = 0;
    for (const s of summary) { totIn += toDisp(s.total_in, s.currency); totOut += toDisp(s.total_out, s.currency); count += s.tx_count; }
    for (const c of byCat) {
      const e = catMap.get(c.name) ?? { in: 0, out: 0, count: 0 };
      e.in += toDisp(c.total_in, c.currency); e.out += toDisp(c.total_out, c.currency); e.count += c.tx_count;
      catMap.set(c.name, e);
    }
    for (const g of bySeg) {
      const key = `${g.branch_name}|${g.segment_name}`;
      const e = segMap.get(key) ?? { branch: g.branch_name, segment: g.segment_name, in: 0, out: 0, count: 0 };
      e.in += toDisp(g.total_in, g.currency); e.out += toDisp(g.total_out, g.currency); e.count += g.tx_count;
      segMap.set(key, e);
    }
    blocks.push({
      currency: "USD",
      totIn, totOut, count,
      cats: [...catMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.in + b.out - (a.in + a.out)),
      segs: [...segMap.values()],
    });
  } else {
    for (const s of summary) {
      blocks.push({
        currency: s.currency,
        totIn: toNumber(s.total_in), totOut: toNumber(s.total_out), count: s.tx_count,
        cats: byCat.filter((c) => c.currency === s.currency).map((c) => ({ name: c.name, in: toNumber(c.total_in), out: toNumber(c.total_out), count: c.tx_count })),
        segs: bySeg.filter((g) => g.currency === s.currency).map((g) => ({ branch: g.branch_name, segment: g.segment_name, in: toNumber(g.total_in), out: toNumber(g.total_out), count: g.tx_count })),
      });
    }
  }

  // Nama konteks filter
  const branchName = filterBranchId
    ? (await queryOne<{ name: string }>(`SELECT name FROM branches WHERE id=$1`, [filterBranchId]))?.name ?? "—"
    : "Semua Cabang (Konsolidasi)";
  const segmentName = filterSegmentId
    ? (await queryOne<{ name: string }>(`SELECT name FROM segments WHERE id=$1`, [filterSegmentId]))?.name ?? "—"
    : "Semua Tipe Dana";
  const subName = filterSubId
    ? (await queryOne<{ name: string }>(`SELECT name FROM sub_segments WHERE id=$1`, [filterSubId]))?.name ?? "—"
    : "Semua Sub Tipe Dana";
  const account = filterAccountId
    ? await queryOne<{ bank: string; account_number: string; purpose: string }>(`SELECT bank, account_number, purpose FROM accounts WHERE id=$1`, [filterAccountId])
    : null;

  // ── PDF ──
  const M = 32;
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const pageW = doc.page.width, pageH = doc.page.height, usableW = pageW - 2 * M;
  const bottomLimit = pageH - 52;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const nfFor = (cur: string) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: cur === "IDR" ? 0 : 2, maximumFractionDigits: cur === "IDR" ? 0 : 2 });

  function ensure(h: number) { if (doc.y + h > bottomLimit) doc.addPage(); }

  function drawTableRow(colW: number[], align: ("left" | "right")[], vals: string[], o: { bold?: boolean; fill?: string } = {}) {
    const rowH = 14;
    const yy = doc.y;
    if (o.fill) doc.rect(M, yy - 1, usableW, rowH).fill(o.fill);
    doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor("#1a1a1a");
    let x = M;
    for (let i = 0; i < colW.length; i++) {
      let t = vals[i] ?? "";
      const w = colW[i] - 6;
      if (t && doc.widthOfString(t) > w) { while (t.length > 1 && doc.widthOfString(t + "…") > w) t = t.slice(0, -1); t = t + "…"; }
      doc.text(t, x + 3, yy + 3, { width: w, align: align[i], lineBreak: false });
      x += colW[i];
    }
    doc.y = yy + rowH;
  }
  function table(colW: number[], align: ("left" | "right")[], headers: string[], rows: string[][]) {
    const header = () => drawTableRow(colW, align, headers, { bold: true, fill: "#f1f0eb" });
    ensure(28); header();
    for (const r of rows) { if (doc.y + 14 > bottomLimit) { doc.addPage(); header(); } drawTableRow(colW, align, r); }
  }

  // Header dokumen
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a1a1a").text("ECC Global Finance", M, M);
  doc.font("Helvetica").fontSize(10).fillColor("#4a4a4a").text("Laporan Keuangan", M, doc.y + 1);
  doc.fontSize(8).fillColor("#8a8a8a").text(`Dicetak: ${new Date().toLocaleString("id-ID")}`, M, doc.y + 2);
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(9).fillColor("#1a1a1a");
  const ctx = [
    `Periode: ${fmtDate(period.from)} — ${fmtDate(period.to)}`,
    `Cabang: ${branchName}`,
    `Tipe Dana: ${segmentName}`,
    `Sub Tipe Dana: ${subName}`,
    account ? `Rekening: ${account.bank} — ${account.account_number} · ${account.purpose}` : null,
    `Tampilan: ${viewMode === "usd" ? "Dikonversi ke USD" : "Mata Uang Asli (Multi-Currency)"}`,
  ].filter(Boolean) as string[];
  for (const line of ctx) doc.text(line, M, doc.y + 1);
  doc.moveDown(0.6);

  if (blocks.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#8a8a8a").text("Tidak ada transaksi pada periode & filter ini.", M, doc.y + 4);
  }

  for (const blk of blocks) {
    const nf = nfFor(blk.currency);
    const net = blk.totIn - blk.totOut;
    ensure(40);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a1a").text(`Mata Uang: ${blk.currency}`, M, doc.y + 4);
    doc.font("Helvetica").fontSize(9).fillColor("#4a4a4a");
    doc.text(`Masuk: ${nf.format(blk.totIn)}    Keluar: ${nf.format(blk.totOut)}    Net: ${nf.format(net)}    Transaksi: ${blk.count}`, M, doc.y + 2);
    doc.moveDown(0.4);

    // Per kategori
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a1a1a").text("Per Kategori", M, doc.y + 2);
    doc.moveDown(0.1);
    const catColW = [191, 100, 100, 90, usableW - 481];
    table(
      catColW,
      ["left", "right", "right", "right", "right"],
      ["Kategori", "Masuk", "Keluar", "Net", "Tx"],
      blk.cats.map((c) => [c.name, c.in ? nf.format(c.in) : "", c.out ? nf.format(c.out) : "", nf.format(c.in - c.out), String(c.count)])
    );
    doc.moveDown(0.5);

    // Per Tipe Dana
    if (blk.segs.length > 0) {
      ensure(30);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a1a1a").text("Per Tipe Dana (Cabang)", M, doc.y + 2);
      doc.moveDown(0.1);
      const segColW = [110, 110, 85, 85, 90, usableW - 480];
      table(
        segColW,
        ["left", "left", "right", "right", "right", "right"],
        ["Cabang", "Tipe Dana", "Masuk", "Keluar", "Net", "Tx"],
        blk.segs.map((g) => [g.branch, g.segment, g.in ? nf.format(g.in) : "", g.out ? nf.format(g.out) : "", nf.format(g.in - g.out), String(g.count)])
      );
    }
    doc.moveDown(0.7);
  }

  // Footer Powered by IDEA
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
  const filename = `Laporan-Keuangan-${period.from}_${period.to}.pdf`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
