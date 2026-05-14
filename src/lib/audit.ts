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

  await db.query(
    `INSERT INTO audit_logs
       (actor_role, actor_branch_id, action, target_table, target_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      session.role,
      session.branchId ?? null,
      action,
      opts.target_table ?? null,
      opts.target_id ?? null,
      opts.details ? JSON.stringify(opts.details) : null,
      ip,
      userAgent,
    ]
  );
}
