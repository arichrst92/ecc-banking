import bcrypt from "bcryptjs";
import { query, queryOne, db } from "@/lib/db";
import { createSession, setSessionCookie, type SessionRole } from "@/lib/session";

const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAIL = 5;

export type LoginInput = {
  scope: SessionRole;
  branchId?: number;
  code: string;
  ip: string;
  userAgent?: string;
};

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "INVALID_CODE" | "RATE_LIMITED" | "BAD_INPUT" };

export async function login(input: LoginInput): Promise<LoginResult> {
  if (!/^\d{8}$/.test(input.code)) return { ok: false, reason: "BAD_INPUT" };
  if (input.scope === "branch" && !input.branchId) return { ok: false, reason: "BAD_INPUT" };

  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000).toISOString();
  const failRows = await query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM login_attempts
      WHERE ip_address = $1 AND success = false AND created_at >= $2`,
    [input.ip, since]
  );
  const failCount = Number(failRows[0]?.count ?? 0);

  if (failCount >= LOGIN_MAX_FAIL) {
    await logAttempt(input, false);
    return { ok: false, reason: "RATE_LIMITED" };
  }

  const codeRow =
    input.scope === "branch"
      ? await queryOne<{ id: number; code_hash: string }>(
          `SELECT id, code_hash FROM auth_codes
            WHERE scope = 'branch' AND branch_id = $1 AND is_active = true LIMIT 1`,
          [input.branchId]
        )
      : await queryOne<{ id: number; code_hash: string }>(
          `SELECT id, code_hash FROM auth_codes
            WHERE scope = 'global' AND branch_id IS NULL AND is_active = true LIMIT 1`
        );

  if (!codeRow) {
    await logAttempt(input, false);
    return { ok: false, reason: "INVALID_CODE" };
  }

  const isPlaceholder = codeRow.code_hash.startsWith("PLACEHOLDER");
  const match = isPlaceholder ? false : await bcrypt.compare(input.code, codeRow.code_hash);
  await logAttempt(input, match);

  if (!match) return { ok: false, reason: "INVALID_CODE" };

  await db.query(`UPDATE auth_codes SET last_used_at = NOW() WHERE id = $1`, [codeRow.id]);

  const token = createSession(input.scope, input.branchId);
  setSessionCookie(token);

  await db.query(
    `INSERT INTO audit_logs (actor_role, actor_branch_id, action, ip_address, user_agent)
     VALUES ($1, $2, 'login_success', $3, $4)`,
    [input.scope, input.branchId ?? null, input.ip, input.userAgent ?? null]
  );

  return { ok: true };
}

async function logAttempt(input: LoginInput, success: boolean) {
  await db.query(
    `INSERT INTO login_attempts (ip_address, user_agent, attempted_scope, attempted_branch_id, success)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.ip, input.userAgent ?? null, input.scope, input.branchId ?? null, success]
  );
  if (!success) {
    await db.query(
      `INSERT INTO audit_logs (actor_role, actor_branch_id, action, ip_address, user_agent)
       VALUES ($1, $2, 'login_fail', $3, $4)`,
      [input.scope, input.branchId ?? null, input.ip, input.userAgent ?? null]
    );
  }
}
