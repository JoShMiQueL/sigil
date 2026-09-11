import { db, schema } from "@sigil/db";
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
  | "password_reset_complete"
  | "region_create"
  | "region_delete"
  | "pairing_token_generate"
  | "node_register"
  | "node_update"
  | "node_delete"
  | "node_credential_regenerate"
  | "node_credential_revoke"
  | "server_create"
  | "server_start"
  | "server_stop"
  | "server_restart"
  | "server_delete"
  | "server_console_token"
  | "allocation_create"
  | "allocation_delete"
  | "allocation_assign"
  | "allocation_unassign"
  | "allocation_auto_assign"
  | "allocation_release";

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
