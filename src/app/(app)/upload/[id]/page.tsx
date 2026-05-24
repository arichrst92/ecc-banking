import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getSession } from "@/lib/session";
import { db, queryOne, query } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { readUploadFile } from "@/lib/upload-storage";
import { detectAndParse } from "@/parsers/registry";
import { batchCategorize, type BatchCategorizeResult } from "@/parsers/ai-categorizer";
import { computeDupHash } from "@/lib/dup-hash";
import type { Category } from "@/lib/types";
import { confirmUploadAction, cancelUploadAction } from "./actions";

export const dynamic = "force-dynamic";

type UploadRow = {
  id: number;
  account_id: number;
  branch_id: number;
  filename: string;
  parser_name: string;
  status: "pending" | "processing" | "success" | "failed";
  storage_path: string | null;
  date_from: string;
  date_to: string;
  currency: string;
  opening_balance: string | null;
  closing_balance: string | null;
  total_debit_period: string | null;
  total_credit_period: string | null;
  total_debit_count: number | null;
  total_credit_count: number | null;
  tx_count: number;
  uploaded_at: string;
  // joined
  bank: string;
  account_number: string;
  account_holder: string;
  purpose: string;
  account_currency: string | null;
  branch_name: string;
  branch_code: string;
  segment_name: string;
  segment_id: number;
  sub_name: string;
  sub_id: number;
};

export default async function UploadPreviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { llm?: string; profile?: string };
}) {
  const session = getSession()!;
  const uploadId = Number(params.id);
  if (isNaN(uploadId)) notFound();

  const u = await queryOne<UploadRow>(
    `SELECT u.id, u.account_id, u.branch_id, u.filename, u.parser_name, u.status,
            u.storage_path, u.date_from, u.date_to, u.currency,
            u.opening_balance, u.closing_balance,
            u.total_debit_period, u.total_credit_period,
            u.total_debit_count, u.total_credit_count,
            u.tx_count, u.uploaded_at,
            a.bank, a.account_number, a.account_holder, a.purpose,
            a.currency AS account_currency,
            b.name AS branch_name, b.code AS branch_code,
            s.id AS segment_id, s.name AS segment_name,
            ss.id AS sub_id, ss.name AS sub_name
       FROM uploads u
       JOIN accounts a ON a.id = u.account_id
       JOIN sub_segments ss ON ss.id = a.sub_segment_id
       JOIN segments s ON s.id = ss.segment_id
       JOIN branches b ON b.id = u.branch_id
      WHERE u.id = $1`,
    [uploadId]
  );

  if (!u) notFound();

  // RBAC
  if (session.role === "branch" && u.branch_id !== session.branchId) {
    redirect("/upload?err=Akses%20ditolak");
  }

  // Status guards
  if (u.status === "success") {
    redirect(`/transaksi?upload=${u.id}`);
  }
  if (u.status === "failed") {
    redirect(`/upload?err=${encodeURIComponent(`Upload ${u.id} gagal — silakan upload ulang`)}`);
  }

  // Read file dan parse ulang untuk preview semua transaksi + AI categorize
  type SampleTx = {
    tx_date: string; tx_time: string | null; description: string;
    description_normalized: string; debit: number; credit: number;
    balance: number | null; direction: "in" | "out";
  };
  let sampleTxs: SampleTx[] = [];
  let parseError: string | null = null;
  let catCache: BatchCategorizeResult | null = null;
  let catError: string | null = null;

  if (u.storage_path) {
    try {
      const content = await readUploadFile(u.storage_path);
      const detected = await detectAndParse(content, u.filename, {
        actor_role: session.role,
        allow_llm_fallback: false,
      });
      sampleTxs = detected.result.transactions;

      // Load categories untuk classification
      const categories = await query<Category>(
        `SELECT * FROM categories ORDER BY priority ASC, name ASC`
      );

      // Check cache di uploads row
      const cachedRow = await queryOne<{ categorization_cache: BatchCategorizeResult | null }>(
        `SELECT categorization_cache FROM uploads WHERE id = $1`, [u.id]
      );
      if (cachedRow?.categorization_cache) {
        catCache = cachedRow.categorization_cache;
      } else {
        // Belum ada cache: jalankan batch categorize (AI atau keyword fallback)
        try {
          catCache = await batchCategorize(u.account_id, sampleTxs, categories);
          // Persist cache + cost
          await db.query(
            `UPDATE uploads
                SET categorization_cache = $1::jsonb,
                    ai_categorization_cost_usd = $2
              WHERE id = $3`,
            [JSON.stringify(catCache), catCache.cost_usd.toFixed(4), u.id]
          );
        } catch (e: any) {
          catError = e.message ?? String(e);
        }
      }
    } catch (e: any) {
      parseError = e.message ?? String(e);
    }
  } else {
    parseError = "File hilang dari penyimpanan";
  }

  // Balance computation (preview)
  const open = parseFloat(u.opening_balance ?? "0");
  const sumCredit = sampleTxs.reduce((s, t) => s + t.credit, 0);
  const sumDebit = sampleTxs.reduce((s, t) => s + t.debit, 0);
  const computedClose = open + sumCredit - sumDebit;
  const close = parseFloat(u.closing_balance ?? "0");
  const balanceOk = u.closing_balance !== null ? Math.abs(close - computedClose) <= 1 : null;

  const currencyMismatch = u.account_currency !== u.currency;

  return (
    <>
      <div className="mb-4">
        <Link href="/upload" className="text-[12px] text-ink-3 hover:text-navy">
          ← Kembali ke Upload
        </Link>
      </div>

      <Topbar
        title={`Preview Upload #${u.id}`}
        role={session.role}
        subtitle={`${u.filename} · ${u.parser_name} · uploaded ${formatDateTime(u.uploaded_at)}`}
      />

      {searchParams.llm === "1" && (
        <div className="card bg-[#eef3fd] border-[#c5d4f7] mb-4">
          <h3 className="font-semibold text-[13px] text-info mb-1">
            ✨ Format baru di-pelajari oleh AI
          </h3>
          <p className="text-[12px] text-ink-2">
            Profile parser <strong>{searchParams.profile ?? "—"}</strong> dibuat dari analisa Claude API.
            Verifikasi data preview di bawah. Format ini sudah disimpan, upload berikutnya dengan
            format yang sama akan parse instant tanpa LLM (gratis &amp; cepat).
          </p>
          <p className="text-[11px] text-ink-3 mt-2">
            Untuk review/edit profile: <strong>Kelola Format Parser</strong> (Global Admin only).
          </p>
        </div>
      )}

      {parseError && (
        <div className="card bg-[#fef3f2] border-[#f5c5c2] mb-4">
          <p className="text-[12px] text-bad-2">Parser error: {parseError}</p>
        </div>
      )}

      {/* Detection panel */}
      <div className="card mb-4 bg-gradient-to-br from-[#eef8f5] to-[#e8f4ff] border-[#b8ddd8]">
        <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
          ✅ Rekening Terdeteksi & Dicocokkan
        </div>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1a6b5a] text-white flex items-center justify-center text-lg shrink-0">
            🏦
          </div>
          <div className="flex-1">
            <div className="font-semibold text-navy text-[14px]">
              No. Rekening: {u.account_number}
            </div>
            <div className="text-[11px] text-ink-3">
              Terdeteksi dari header file mutasi · parser: {u.parser_name}
            </div>
          </div>
          <span className="chip chip-green">Terdaftar</span>
        </div>

        <div className="mt-4 pt-3 border-t border-[#b8ddd8]">
          <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
            Path Lokasi Dana
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[12px] mb-3 bg-white/60 rounded-lg px-3 py-2">
            <Link href={`/cabang/${u.branch_id}`} className="font-medium text-ink hover:text-brand-orange">
              {u.branch_name}
            </Link>
            <span className="text-ink-3">›</span>
            <Link
              href={`/cabang/${u.branch_id}/tipe-dana/${u.segment_id}`}
              className="font-medium text-ink hover:text-brand-orange"
            >
              {u.segment_name}
            </Link>
            <span className="text-ink-3">›</span>
            <Link
              href={`/cabang/${u.branch_id}/tipe-dana/${u.segment_id}/sub/${u.sub_id}`}
              className="font-medium text-ink hover:text-brand-orange"
            >
              {u.sub_name}
            </Link>
            <span className="text-ink-3">›</span>
            <span className="font-semibold text-brand-orange">{u.bank} {u.account_number.slice(-4)}</span>
          </div>

          <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
            Detail Rekening
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[13px]">
            <span className="font-semibold">{u.bank} — {u.account_number}</span>
            <span className="text-ink-2">a.n. {u.account_holder}</span>
            <span className="chip chip-purple">📌 {u.purpose}</span>
            <span className="chip chip-amber">{u.currency}</span>
          </div>
        </div>

        {currencyMismatch && (
          <div className="mt-3 p-2 bg-[#fde8e6] border border-[#f5c5c2] rounded text-[11px] text-bad-2">
            ⚠ Currency mismatch: file <strong>{u.currency}</strong>, akun terdaftar{" "}
            <strong>{u.account_currency}</strong>. Confirm akan diblock.
          </div>
        )}
      </div>

      {/* Period + balance summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">PERIODE</div>
          <div className="text-[13px] font-semibold text-navy">
            {formatDate(u.date_from)} —<br />{formatDate(u.date_to)}
          </div>
        </div>
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">SALDO AWAL</div>
          <div className="text-[16px] font-bold">{formatMoney(u.opening_balance, u.currency)}</div>
        </div>
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">SALDO AKHIR</div>
          <div className="text-[16px] font-bold">{formatMoney(u.closing_balance, u.currency)}</div>
        </div>
        <div className="stat-card">
          <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">JUMLAH TRANSAKSI</div>
          <div className="text-[22px] font-bold">{u.tx_count}</div>
          <div className="text-[10px] text-ink-3 mt-0.5">
            {u.total_debit_count ?? 0} DB · {u.total_credit_count ?? 0} CR
          </div>
        </div>
      </div>

      {/* Balance check */}
      {u.opening_balance !== null && u.closing_balance !== null && (
        <div
          className={`card mb-4 ${
            balanceOk === false
              ? "bg-[#fef3f2] border-[#f5c5c2]"
              : balanceOk === true
              ? "bg-[#eef8f5] border-[#b8ddd8]"
              : ""
          }`}
        >
          <div className="text-[12px] font-semibold mb-2">
            Balance Check {balanceOk === true ? "✅ PASS" : balanceOk === false ? "❌ FAIL" : "⏳"}
          </div>
          <div className="text-[11px] text-ink-2 space-y-1">
            <div>Saldo Awal: <strong>{formatMoney(open, u.currency)}</strong></div>
            <div>+ Total Kredit (parsed): <strong>{formatMoney(sumCredit, u.currency)}</strong></div>
            <div>− Total Debet (parsed): <strong>{formatMoney(sumDebit, u.currency)}</strong></div>
            <div>= Saldo Akhir (computed): <strong>{formatMoney(computedClose, u.currency)}</strong></div>
            <div>vs Saldo Akhir di file: <strong>{formatMoney(close, u.currency)}</strong></div>
            {balanceOk === false && (
              <div className="text-bad-2 mt-2">
                ⚠ Selisih {formatMoney(Math.abs(close - computedClose), u.currency)}.
                Mungkin parser miss transaksi. Bisa lanjut, tapi disarankan cek manual.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Categorization status banner */}
      {catError && (
        <div className="card bg-[#fef3f2] border-[#f5c5c2] mb-4">
          <p className="text-[12px] text-bad-2">
            <strong>Kategorisasi gagal:</strong> {catError}
            <br />
            <span className="text-[11px]">
              Saat confirm, sistem akan fallback ke keyword-based categorization. Cek ANTHROPIC_API_KEY di .env.local.
            </span>
          </p>
        </div>
      )}

      {catCache && (
        <div className={`card mb-4 ${
          catCache.method === "ai" ? "bg-[#eef3fd] border-[#c5d4f7]" : "bg-[#fef7e8] border-[#f5d98a]"
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="font-semibold text-[13px] mb-1">
                {catCache.method === "ai" ? "🤖 Kategorisasi AI" : "🔤 Kategorisasi Keyword (fallback)"}
              </h3>
              <p className="text-[11px] text-ink-2">
                {catCache.method === "ai"
                  ? `Diklasifikasi via ${catCache.model} · ${catCache.input_tokens} in / ${catCache.output_tokens} out tokens · cost $${catCache.cost_usd.toFixed(4)}`
                  : "ANTHROPIC_API_KEY tidak tersedia atau AI gagal. Pakai keyword matching dari Kategori — bisa di-review per transaksi setelah confirm."}
                . Cache tersimpan di DB, confirm tidak akan re-run AI.
              </p>
            </div>
            {(() => {
              const aiCount = Object.values(catCache.classifications).filter((c) => c.method === "ai").length;
              const kwCount = Object.values(catCache.classifications).filter((c) => c.method === "keyword").length;
              return (
                <div className="text-right text-[10px] text-ink-3 shrink-0">
                  <div>{aiCount} via AI</div>
                  <div>{kwCount} via keyword</div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* All transactions with classification */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[14px]">
            Semua Transaksi ({sampleTxs.length} parsed)
          </h3>
          <div className="text-[11px] text-ink-3">
            Total: <span className="text-good font-semibold">
              +{formatMoney(sampleTxs.reduce((s, t) => s + t.credit, 0), u.currency)}
            </span>
            {" / "}
            <span className="text-bad-2 font-semibold">
              −{formatMoney(sampleTxs.reduce((s, t) => s + t.debit, 0), u.currency)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-line rounded-lg">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-line">
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">#</th>
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Tanggal</th>
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Keterangan</th>
                <th className="text-left py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kategori</th>
                <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Debit</th>
                <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Kredit</th>
                <th className="text-right py-2 px-2 text-[10px] uppercase tracking-wider text-ink-3 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {sampleTxs.map((t, i) => {
                const hash = computeDupHash(
                  u.account_id, t.tx_date, t.debit, t.credit, t.description_normalized
                );
                const cls = catCache?.classifications[hash];
                return (
                  <tr key={i} className="border-b border-line hover:bg-cream">
                    <td className="py-1.5 px-2 text-ink-3 text-[10px]">{i + 1}</td>
                    <td className="py-1.5 px-2 text-ink-3 whitespace-nowrap">
                      {formatDate(t.tx_date)}
                      {t.tx_time && (
                        <div className="text-[9px] text-ink-3">{t.tx_time}</div>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-ink-2 text-[11px] max-w-md">
                      <span className="line-clamp-2" title={t.description}>{t.description}</span>
                    </td>
                    <td className="py-1.5 px-2">
                      {cls ? (
                        <div title={`${cls.method === "ai" ? "🤖 AI" : "🔤 Keyword"} · confidence ${(cls.confidence * 100).toFixed(0)}%\n${cls.reason}`}>
                          <span className="chip" style={{
                            background: cls.confidence >= 0.7 ? "#eef8f5" : cls.confidence >= 0.5 ? "#fef7e8" : "#fef3f2",
                            color: cls.confidence >= 0.7 ? "#1a6b5a" : cls.confidence >= 0.5 ? "#8a5a0a" : "#b02820",
                          }}>
                            {cls.method === "ai" ? "🤖 " : ""}{cls.category_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right text-bad-2 whitespace-nowrap">
                      {t.debit > 0 ? formatMoney(t.debit, u.currency) : ""}
                    </td>
                    <td className="py-1.5 px-2 text-right text-good whitespace-nowrap">
                      {t.credit > 0 ? formatMoney(t.credit, u.currency) : ""}
                    </td>
                    <td className="py-1.5 px-2 text-right text-ink-3 whitespace-nowrap text-[11px]">
                      {t.balance !== null ? formatMoney(t.balance, u.currency) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-3 mt-2">
          Tabel scrollable. Hover chip kategori untuk lihat alasan klasifikasi. Bisa re-categorize manual per transaksi setelah confirm di menu Transaksi.
        </p>
      </div>

      {/* Action buttons */}
      <div className="card flex items-center justify-between bg-[#fef9ee] border-[#f5e5a0]">
        <div className="text-[12px] text-ink-2">
          <p className="font-semibold">Konfirmasi Simpan</p>
          <p className="text-ink-3 mt-1">
            Klik <strong>Proses & Simpan</strong> untuk insert <strong>{u.tx_count}</strong> transaksi ke database
            dengan auto-kategorisasi. Duplikat akan di-skip otomatis.
          </p>
        </div>
        <div className="flex gap-2">
          <form action={cancelUploadAction.bind(null, u.id)} className="inline">
            <button type="submit" className="btn btn-danger">Batal</button>
          </form>
          <form action={confirmUploadAction.bind(null, u.id)} className="inline">
            <button
              type="submit"
              className="btn btn-gold"
              disabled={!!currencyMismatch || !!parseError}
            >
              ✓ Proses & Simpan
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
