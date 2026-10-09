// Seed DEMO data — 100 transaksi + uploads + anggaran, tersebar di semua cabang.
// Jalankan SETELAH `npm run migrate` (butuh tabel COA 0012) & `npm run seed:auth`.
//
//   node scripts/seed-demo.mjs          → tahun 2026 (default)
//   node scripts/seed-demo.mjs 2025     → tahun lain
//
// Idempotent: data demo lama (parser_name='seed-demo') dihapus dulu tiap run,
// jadi aman dijalankan berulang tanpa menumpuk.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error("❌ DATABASE_URL tidak ada. Cek .env.local.");
  process.exit(1);
}

const YEAR = Number(process.argv[2]) || 2026;
const TX_COUNT = 100;
// Sebar transaksi Jan..bulan ini (biar tidak ada data di masa depan).
const MAX_MONTH = YEAR === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;

// RNG deterministik supaya hasil stabil tiap run (mudah di-debug).
let _seed = 20260101 + YEAR;
function rnd() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
// Nominal "cantik" dalam ribuan.
const money = (min, max) => randInt(min, max) * 1000;

function dupHash(accountId, txDate, debit, credit, descNorm) {
  const key = [accountId, txDate, debit.toFixed(2), credit.toFixed(2), descNorm].join("|");
  return createHash("sha256").update(key).digest("hex");
}

// Template keterangan per kode akun (biar realistis + cocok keyword).
const DESC = {
  "4001": ["PERSEMBAHAN IBADAH MINGGU", "OFFERING KEBAKTIAN UMUM", "PERSEMBAHAN SYUKUR"],
  "4002": ["PERSEMBAHAN IBADAH RAYA", "OFFERING IBADAH SORE"],
  "4003": ["TITHE PERSEPULUHAN", "PERPULUHAN JEMAAT", "TITHE TRANSFER"],
  "4004": ["SPECIAL OFFERING PLEDGE", "JANJI IMAN PEMBANGUNAN", "PLEDGE MISSION"],
  "4005": ["OFFERING CKIDS", "PERSEMBAHAN BRIDGE TEENS", "OFFERING TEENS"],
  "4006": ["PENDAPATAN LAIN DONASI", "OTHERS REVENUE BAZAR"],
  "4007": ["BUNGA BANK", "JASA GIRO BANK", "BANK INTEREST"],
  "5001": ["BIAYA ADMIN BANK", "ADM BANK BULANAN", "BANK CHARGE"],
  "5002": ["BIAYA LAIN-LAIN", "MISC EXPENSE OPERASIONAL"],
  "5003": ["KONSUMSI IBADAH", "CONSUMPTION RAPAT", "KONSUMSI PELAYANAN"],
  "5004": ["HOSPITALITY HOSTING TAMU", "HOSTING PENDETA TAMU"],
  "5005": ["SEWA GEDUNG IBADAH", "RENT AULA KEBAKTIAN"],
  "5006": ["PEMBAYARAN PLN LISTRIK", "TAGIHAN PDAM AIR", "TELKOM INTERNET"],
  "5007": ["ALLOWANCE PELAYAN", "TUNJANGAN PENGERJA"],
  "5008": ["CICILAN PEMBANGUNAN GEDUNG", "BUILDING INSTALLMENT"],
  "5009": ["SERVICE AC GEREJA", "SERVIS SOUND SYSTEM"],
  "5010": ["CKIDS EXPENSE ACARA", "BELANJA CKIDS"],
  "5011": ["BCC EXPENSE KEGIATAN", "BIAYA BCC"],
  "5012": ["GAJI STAFF", "HONOR HAMBA TUHAN", "SALARY HR"],
  "5013": ["CENTRALIZATION ECC GLOBAL", "SETORAN ECC GLOBAL"],
  "5014": ["SAVING TABUNGAN GEREJA", "TRANSFER TABUNGAN"],
};
const GENERIC_IN = ["PENERIMAAN KAS", "TRANSFER MASUK JEMAAT"];
const GENERIC_OUT = ["PENGELUARAN OPERASIONAL", "PEMBAYARAN RUTIN"];

const client = new pg.Client({ connectionString: conn });
await client.connect();

try {
  await client.query("BEGIN");

  // ── Ambil master data ──
  const { rows: accounts } = await client.query(
    `SELECT id, branch_id, currency FROM accounts WHERE status = 'aktif' ORDER BY id`
  );
  if (accounts.length === 0) throw new Error("Tidak ada akun aktif. Jalankan migrate dulu.");

  const { rows: cats } = await client.query(
    `SELECT c.id, c.account_code, c.type, COALESCE(g.kind, 'other') AS kind
       FROM categories c
       LEFT JOIN category_groups g ON g.id = c.group_id
      WHERE c.group_id IS NOT NULL AND c.is_system = false
      ORDER BY c.account_code NULLS LAST, c.id`
  );
  if (cats.length === 0) throw new Error("Tidak ada kategori ber-grup. Jalankan migrate 0012 dulu.");

  const revenueCats = cats.filter((c) => c.kind === "revenue");
  const expenseCats = cats.filter((c) => c.kind === "expense" || c.kind === "other");

  // ── Bersihkan data demo lama ──
  await client.query(
    `DELETE FROM transactions WHERE upload_id IN (SELECT id FROM uploads WHERE parser_name = 'seed-demo')`
  );
  await client.query(`DELETE FROM uploads WHERE parser_name = 'seed-demo'`);
  await client.query(
    `DELETE FROM fiscal_budgets WHERE fiscal_year = $1 AND branch_id IN (
       SELECT DISTINCT branch_id FROM accounts
     )`,
    [YEAR]
  );

  // ── 1 upload "seed-demo" per akun ──
  const uploadByAccount = new Map();
  for (const a of accounts) {
    const { rows } = await client.query(
      `INSERT INTO uploads
         (account_id, branch_id, filename, mime_type, file_size_bytes, parser_name,
          date_from, date_to, currency, status, uploaded_by_role, processed_at)
       VALUES ($1,$2,$3,'text/csv',0,'seed-demo',$4,$5,$6,'success','global',NOW())
       RETURNING id`,
      [a.id, a.branch_id, `SEED-DEMO-${a.id}-${YEAR}.csv`, `${YEAR}-01-01`, `${YEAR}-12-31`, a.currency]
    );
    uploadByAccount.set(a.id, rows[0].id);
  }

  // ── Generate 100 transaksi ──
  const seen = new Set();
  let inserted = 0;
  let attempts = 0;
  while (inserted < TX_COUNT && attempts < TX_COUNT * 20) {
    attempts++;
    const acc = pick(accounts);
    // 40% pemasukan, 60% pengeluaran → mirip realita gereja
    const isIncome = rnd() < 0.4;
    const cat = isIncome ? pick(revenueCats) : pick(expenseCats);
    if (!cat) continue;

    const month = randInt(1, MAX_MONTH);
    const day = randInt(1, 28);
    const txDate = `${YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const amount = isIncome ? money(2000, 45000) : money(300, 18000);
    const debit = isIncome ? 0 : amount;
    const credit = isIncome ? amount : 0;
    const direction = isIncome ? "in" : "out";

    const pool = DESC[cat.account_code] ?? (isIncome ? GENERIC_IN : GENERIC_OUT);
    let desc = pick(pool);
    let descNorm = desc.toUpperCase();
    let hash = dupHash(acc.id, txDate, debit, credit, descNorm);

    // Hindari tabrakan dup_hash (unik global).
    if (seen.has(hash)) {
      desc = `${desc} #${attempts}`;
      descNorm = desc.toUpperCase();
      hash = dupHash(acc.id, txDate, debit, credit, descNorm);
    }
    if (seen.has(hash)) continue;
    seen.add(hash);

    try {
      await client.query(
        `INSERT INTO transactions
           (account_id, branch_id, upload_id, category_id, currency, tx_date, tx_time,
            description, description_normalized, debit, credit, balance, direction, dup_hash)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,$10,NULL,$11,$12)`,
        [
          acc.id, acc.branch_id, uploadByAccount.get(acc.id), cat.id, acc.currency,
          txDate, desc, descNorm, debit, credit, direction, hash,
        ]
      );
      inserted++;
    } catch (e) {
      if (e.code === "23505") continue; // dup_hash bentrok dgn data existing → skip
      throw e;
    }
  }

  // ── Update agregat upload + saldo akun (biar dashboard terisi) ──
  await client.query(
    `UPDATE uploads u SET
        tx_count = sub.cnt, tx_inserted = sub.cnt,
        total_debit_period = sub.deb, total_credit_period = sub.cred,
        total_debit_count = sub.dcnt, total_credit_count = sub.ccnt,
        balance_check_passed = true
       FROM (
         SELECT upload_id,
                COUNT(*) AS cnt,
                COALESCE(SUM(debit),0) AS deb, COALESCE(SUM(credit),0) AS cred,
                COUNT(*) FILTER (WHERE debit > 0) AS dcnt,
                COUNT(*) FILTER (WHERE credit > 0) AS ccnt
           FROM transactions GROUP BY upload_id
       ) sub
      WHERE u.id = sub.upload_id AND u.parser_name = 'seed-demo'`
  );
  await client.query(
    `UPDATE accounts a SET current_balance = sub.bal, last_synced_at = NOW()
       FROM (
         SELECT account_id, COALESCE(SUM(credit) - SUM(debit),0) AS bal
           FROM transactions GROUP BY account_id
       ) sub
      WHERE a.id = sub.account_id`
  );

  // ── Seed anggaran (budget) per cabang & kategori, bulan 1..12 ──
  const { rows: branches } = await client.query(
    `SELECT DISTINCT branch_id FROM accounts WHERE status = 'aktif'`
  );
  let budgetRows = 0;
  for (const b of branches) {
    for (const c of cats) {
      const isRev = c.kind === "revenue";
      const base = isRev ? money(8000, 30000) : money(1000, 12000);
      for (let m = 1; m <= 12; m++) {
        // variasi ±15% biar tidak flat
        const amt = Math.round(base * (0.85 + rnd() * 0.3));
        await client.query(
          `INSERT INTO fiscal_budgets (branch_id, category_id, fiscal_year, month, currency, amount)
           VALUES ($1,$2,$3,$4,'IDR',$5)
           ON CONFLICT (branch_id, category_id, fiscal_year, month)
           DO UPDATE SET amount = EXCLUDED.amount`,
          [b.branch_id, c.id, YEAR, m, amt]
        );
        budgetRows++;
      }
    }
  }

  await client.query("COMMIT");

  console.log(`\n✅ Seed demo selesai untuk tahun ${YEAR}:`);
  console.log(`   • ${accounts.length} upload (seed-demo)`);
  console.log(`   • ${inserted} transaksi (Jan–${String(MAX_MONTH).padStart(2, "0")})`);
  console.log(`   • ${budgetRows} baris anggaran di ${branches.length} cabang`);
  console.log(`\n   Buka /fiskal, /dashboard, /laporan, /transaksi untuk lihat datanya.`);
  console.log(`   Ulangi: node scripts/seed-demo.mjs ${YEAR}  (data demo lama otomatis diganti).`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("❌ Gagal seed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
