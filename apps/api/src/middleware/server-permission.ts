import { db, schema } from "@sigil/db";
import type { Permission } from "@sigil/shared";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import type { AuthContext } from "./auth";

const PERMISSION_COLUMNS = {
  console: schema.serverMembers.canConsole,
  files: schema.serverMembers.canFiles,
  backups: schema.serverMembers.canBackups,
  power: schema.serverMembers.canPower,
  settings: schema.serverMembers.canSettings,
  members: schema.serverMembers.canMembers,
  allocations: schema.serverMembers.canAllocations,
  databases: schema.serverMembers.canDatabases,
} as const;

export function requireServerPermission(permission: Permission) {
  return async (c: Context<AuthContext>, next: () => Promise<void>) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
    }

    // Admins bypass all permission checks
    if (user.role === "admin") {
      await next();
      return;
    }

    const serverId = c.req.param("serverId");
    if (!serverId) {
      return c.json({ error: { code: "BAD_REQUEST", message: "Missing serverId" } }, 400);
    }

    // Check if user is a member with the required permission
    const [member] = await db
      .select({
        role: schema.serverMembers.role,
        hasPermission: PERMISSION_COLUMNS[permission],
      })
      .from(schema.serverMembers)
      .where(
        and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, user.id)),
      )
      .limit(1);

    if (!member) {
      return c.json({ error: { code: "FORBIDDEN", message: "Not a member of this server" } }, 403);
    }

    // Owner has all permissions implicitly
    if (member.role === "owner" || member.hasPermission) {
      await next();
      return;
    }

    return c.json(
      { error: { code: "FORBIDDEN", message: `Missing permission: ${permission}` } },
      403,
    );
  };
}
