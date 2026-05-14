// PostgreSQL connection pool — node-pg.

import { Pool, type QueryResult, type QueryResultRow, types } from "pg";

// node-pg by default return BIGINT (OID 20) sebagai STRING untuk avoid precision
// loss pada nilai > 2^53. Untuk schema ECC, ID tidak akan dekat batas itu, jadi
// aman parse jadi JS number. Tanpa ini, `id === Number(...)` selalu false.
types.setTypeParser(20, (val) => parseInt(val, 10));

// NUMERIC (OID 1700) tetap STRING — untuk preserve presisi money fields.
// (Itu sudah default behavior, no override needed.)

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    throw new Error("DATABASE_URL is not set. Cek .env.local");
  }
  return new Pool({
    connectionString: conn,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const db: Pool = global.__pgPool ?? (global.__pgPool = createPool());

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const res: QueryResult<T> = await db.query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
