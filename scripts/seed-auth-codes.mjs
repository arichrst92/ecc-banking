// Generate bcrypt hash dan UPDATE auth_codes.
// Jalankan SETELAH `npm run migrate` sukses.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
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

const client = new pg.Client({ connectionString: conn });
await client.connect();

const GLOBAL_CODE = "00000000";
const BRANCH_CODE = "12345678";

const globalHash = await bcrypt.hash(GLOBAL_CODE, 12);
const branchHash = await bcrypt.hash(BRANCH_CODE, 12);

console.log("Generated bcrypt hashes (cost 12).");

await client.query(
  `UPDATE auth_codes SET code_hash = $1, updated_at = NOW()
    WHERE scope = 'global' AND branch_id IS NULL`,
  [globalHash]
);

const { rowCount } = await client.query(
  `UPDATE auth_codes SET code_hash = $1, updated_at = NOW()
    WHERE scope = 'branch'`,
  [branchHash]
);

await client.end();

console.log(`\n✅ Updated 1 global code + ${rowCount} branch code(s).`);
console.log(`   Login dengan ${GLOBAL_CODE} (Global) atau ${BRANCH_CODE} (Cabang).`);
