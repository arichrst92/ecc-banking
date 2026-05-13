// Apply semua migration di db/migrations/ secara urut alfabetis.
// Idempotent: lacak via tabel _migrations.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  console.error("❌ DATABASE_URL tidak ada. Cek .env.local atau env shell.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name        TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

const dir = join(root, "db", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

if (files.length === 0) {
  console.log("Tidak ada migration file di db/migrations/");
  await client.end();
  process.exit(0);
}

const { rows: applied } = await client.query(`SELECT name FROM _migrations`);
const appliedSet = new Set(applied.map((r) => r.name));

let count = 0;
for (const f of files) {
  if (appliedSet.has(f)) {
    console.log(`⏭  ${f} (already applied)`);
    continue;
  }
  console.log(`→  ${f}`);
  const sql = readFileSync(join(dir, f), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(`INSERT INTO _migrations(name) VALUES ($1)`, [f]);
    await client.query("COMMIT");
    console.log(`✅ ${f}`);
    count++;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`❌ ${f} FAILED:`, e.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`\nDone — ${count} migration${count === 1 ? "" : "s"} applied, ${files.length - count} skipped.`);
