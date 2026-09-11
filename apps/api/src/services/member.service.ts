import { db, schema } from "@sigil/db";
import type { Member, Permissions } from "@sigil/shared";
import { and, eq } from "drizzle-orm";

function toMember(
  row: typeof schema.serverMembers.$inferSelect,
  user: { username: string; email: string },
): Member {
  return {
    id: row.id,
    serverId: row.serverId,
    userId: row.userId,
    username: user.username,
    email: user.email,
    role: row.role as "owner" | "member",
    permissions: {
      console: row.canConsole,
      files: row.canFiles,
      backups: row.canBackups,
      power: row.canPower,
      settings: row.canSettings,
      members: row.canMembers,
      allocations: row.canAllocations,
      databases: row.canDatabases,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function permissionsToColumns(permissions: Permissions) {
  return {
    canConsole: permissions.console,
    canFiles: permissions.files,
    canBackups: permissions.backups,
    canPower: permissions.power,
    canSettings: permissions.settings,
    canMembers: permissions.members,
    canAllocations: permissions.allocations,
    canDatabases: permissions.databases,
  };
}

export async function getMember(serverId: string, userId: string): Promise<Member | null> {
  const [row] = await db
    .select()
    .from(schema.serverMembers)
    .where(
      and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, userId)),
    )
    .limit(1);
  if (!row) return null;

  const [user] = await db
    .select({ username: schema.users.username, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, row.userId))
    .limit(1);

  return toMember(row, user ?? { username: "unknown", email: "unknown" });
}

export async function getMemberById(memberId: string): Promise<Member | null> {
  const [row] = await db
    .select()
    .from(schema.serverMembers)
    .where(eq(schema.serverMembers.id, memberId))
    .limit(1);
  if (!row) return null;

  const [user] = await db
    .select({ username: schema.users.username, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, row.userId))
    .limit(1);

  return toMember(row, user ?? { username: "unknown", email: "unknown" });
}

export async function listMembers(serverId: string): Promise<Member[]> {
  const rows = await db
    .select()
    .from(schema.serverMembers)
    .where(eq(schema.serverMembers.serverId, serverId))
    .orderBy(schema.serverMembers.createdAt);

  if (rows.length === 0) return [];

  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      email: schema.users.email,
    })
    .from(schema.users);

  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((row) =>
    toMember(row, userMap.get(row.userId) ?? { username: "unknown", email: "unknown" }),
  );
}

export async function addMember(
  serverId: string,
  email: string,
  permissions: Permissions,
): Promise<Member | { error: string; code: string }> {
  // Find user by email
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);

  if (!user) {
    return { error: "No registered user with that email", code: "USER_NOT_FOUND" };
  }
  if (user.status !== "active") {
    return { error: "User account is not active", code: "USER_NOT_FOUND" };
  }

  // Check for duplicate
  const [existing] = await db
    .select({ id: schema.serverMembers.id })
    .from(schema.serverMembers)
    .where(
      and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, user.id)),
    )
    .limit(1);

  if (existing) {
    return { error: "User is already a member of this server", code: "DUPLICATE_MEMBER" };
  }

  const [row] = await db
    .insert(schema.serverMembers)
    .values({
      serverId,
      userId: user.id,
      role: "member",
      ...permissionsToColumns(permissions),
    })
    .returning();

  return toMember(row, { username: user.username, email: user.email });
}

export async function updateMemberPermissions(
  memberId: string,
  permissions: Permissions,
): Promise<Member | { error: string; code: string }> {
  // Check if member exists and is not owner
  const [row] = await db
    .select()
    .from(schema.serverMembers)
    .where(eq(schema.serverMembers.id, memberId))
    .limit(1);

  if (!row) {
    return { error: "Member not found", code: "MEMBER_NOT_FOUND" };
  }
  if (row.role === "owner") {
    return { error: "Owner permissions cannot be modified", code: "CANNOT_MODIFY_OWNER" };
  }

  const [updated] = await db
    .update(schema.serverMembers)
    .set({
      ...permissionsToColumns(permissions),
      updatedAt: new Date(),
    })
    .where(eq(schema.serverMembers.id, memberId))
    .returning();

  const [user] = await db
    .select({ username: schema.users.username, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, row.userId))
    .limit(1);

  return toMember(updated, user ?? { username: "unknown", email: "unknown" });
}

export async function removeMember(
  memberId: string,
): Promise<{ ok: true } | { error: string; code: string }> {
  const [row] = await db
    .select()
    .from(schema.serverMembers)
    .where(eq(schema.serverMembers.id, memberId))
    .limit(1);

  if (!row) {
    return { error: "Member not found", code: "MEMBER_NOT_FOUND" };
  }
  if (row.role === "owner") {
    return { error: "Owner cannot be removed", code: "CANNOT_REMOVE_OWNER" };
  }

  await db.delete(schema.serverMembers).where(eq(schema.serverMembers.id, memberId));
  return { ok: true };
}

export async function transferOwnership(
  serverId: string,
  newOwnerId: string,
): Promise<{ ok: true } | { error: string; code: string }> {
  // Find current owner
  const [currentOwner] = await db
    .select()
    .from(schema.serverMembers)
    .where(and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.role, "owner")))
    .limit(1);

  if (!currentOwner) {
    return { error: "Server has no owner", code: "SERVER_NOT_FOUND" };
  }

  // Find target member
  const [target] = await db
    .select()
    .from(schema.serverMembers)
    .where(eq(schema.serverMembers.id, newOwnerId))
    .limit(1);

  if (!target || target.serverId !== serverId) {
    return { error: "Target member not found", code: "MEMBER_NOT_FOUND" };
  }
  if (target.role === "owner") {
    return { error: "Target is already the owner", code: "ALREADY_OWNER" };
  }

  // Transfer: old owner becomes member, new owner becomes owner with all permissions
  await db
    .update(schema.serverMembers)
    .set({ role: "member", updatedAt: new Date() })
    .where(eq(schema.serverMembers.id, currentOwner.id));

  await db
    .update(schema.serverMembers)
    .set({
      role: "owner",
      canConsole: true,
      canFiles: true,
      canBackups: true,
      canPower: true,
      canSettings: true,
      canMembers: true,
      canAllocations: true,
      canDatabases: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.serverMembers.id, newOwnerId));

  return { ok: true };
}

export async function isOwner(serverId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: schema.serverMembers.role })
    .from(schema.serverMembers)
    .where(
      and(eq(schema.serverMembers.serverId, serverId), eq(schema.serverMembers.userId, userId)),
    )
    .limit(1);
  return row?.role === "owner";
}

export async function createOwner(serverId: string, userId: string): Promise<void> {
  await db.insert(schema.serverMembers).values({
    serverId,
    userId,
    role: "owner",
    canConsole: true,
    canFiles: true,
    canBackups: true,
    canPower: true,
    canSettings: true,
    canMembers: true,
    canAllocations: true,
    canDatabases: true,
  });
}
