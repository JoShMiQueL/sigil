import { db, schema } from "@sigilpanel/db";
import { sql } from "drizzle-orm";

export type AuditAction =
  | "login"
  | "logout"
  | "user_create"
  | "user_suspend"
  | "user_update"
  | "2fa_enable"
  | "2fa_disable"
  | "api_key_create"
  | "api_key_revoke"
  | "password_reset_request"
  | "password_reset_complete";

export async function logAudit(opts: {
  userId?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  await db.insert(schema.auditLogs).values({
    userId: opts.userId ?? null,
    action: opts.action,
    targetType: opts.targetType ?? null,
    targetId: opts.targetId ?? null,
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
    ipAddress: opts.ipAddress ?? null,
  });
}

export async function listAuditLogs(opts: {
  page: number;
  limit: number;
  userId?: string;
}): Promise<{ logs: Array<typeof schema.auditLogs.$inferSelect>; total: number }> {
  const offset = (opts.page - 1) * opts.limit;
  const rows = await db
    .select()
    .from(schema.auditLogs)
    .limit(opts.limit)
    .offset(offset)
    .orderBy(sql`${schema.auditLogs.createdAt} desc`);

  return { logs: rows, total: rows.length };
}
