// Helper: tulis ke audit_logs dari Server Action.

import { headers } from "next/headers";
import { db } from "@/lib/db";
import type { Session } from "@/lib/session";

type AuditOptions = {
  target_table?: string;
  target_id?: number | null;
  details?: Record<string, unknown>;
};

export async function logAudit(session: Session, action: string, opts: AuditOptions = {}) {
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent") ?? null;

  // Validasi branchId — kalau session.branchId tidak ada di tabel branches
  // (mis. branch sudah dihapus atau session lama dari DB sebelumnya),
  // pakai NULL supaya FK tidak violation. Audit log boleh tanpa branch context.
  let safeBranchId: number | null = null;
  if (session.branchId !== undefined && session.branchId !== null) {
    try {
      const { rows } = await db.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM branches WHERE id = $1) AS exists`,
        [session.branchId]
      );
      if (rows[0]?.exists) {
        safeBranchId = session.branchId;
      }
    } catch {
      // ignore, fallback ke null
    }
  }

  try {
    await db.query(
      `INSERT INTO audit_logs
         (actor_role, actor_branch_id, action, target_table, target_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        session.role,
        safeBranchId,
        action,
        opts.target_table ?? null,
        opts.target_id ?? null,
        opts.details ? JSON.stringify(opts.details) : null,
        ip,
        userAgent,
      ]
    );
  } catch (e) {
    // Audit log failure SHOULD NOT break the actual operation.
    // Log to stderr so it's visible di pm2 logs, tapi tetap return success.
    console.error("[logAudit] Gagal tulis audit log (silent):", e);
  }
}
