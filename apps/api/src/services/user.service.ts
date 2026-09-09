import { db, schema } from "@sigilpanel/db";
import type { User, UserCreate, UserUpdate } from "@sigilpanel/shared";
import { and, count, eq, ilike, or } from "drizzle-orm";
import { hashPassword } from "../lib/argon2";

function toUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role as "admin" | "user",
    status: row.status as "active" | "suspended",
    totpEnabled: row.totpEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createUser(input: UserCreate): Promise<User> {
  const passwordHash = await hashPassword(input.password);

  const [row] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      username: input.username,
      passwordHash,
      role: input.role,
      status: "active",
    })
    .returning();

  return toUser(row);
}

export async function listUsers(opts: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ users: User[]; total: number }> {
  const offset = (opts.page - 1) * opts.limit;
  const where = opts.search
    ? or(
        ilike(schema.users.email, `%${opts.search}%`),
        ilike(schema.users.username, `%${opts.search}%`),
      )
    : undefined;

  const rows = await db
    .select()
    .from(schema.users)
    .where(where)
    .limit(opts.limit)
    .offset(offset)
    .orderBy(schema.users.createdAt);

  const [countRow] = await db.select({ value: count() }).from(schema.users).where(where);

  return { users: rows.map(toUser), total: countRow?.value ?? 0 };
}

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);

  return row ? toUser(row) : null;
}

export async function updateUser(id: string, input: UserUpdate): Promise<User | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.email !== undefined) updates.email = input.email;
  if (input.username !== undefined) updates.username = input.username;
  if (input.role !== undefined) updates.role = input.role;
  if (input.status !== undefined) updates.status = input.status;

  const [row] = await db
    .update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, id))
    .returning();

  return row ? toUser(row) : null;
}

export async function suspendUser(
  targetId: string,
  currentUserId: string,
): Promise<{ user: User } | { error: string }> {
  if (targetId === currentUserId) {
    return { error: "Cannot suspend your own account" };
  }

  const [target] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, targetId))
    .limit(1);

  if (!target) {
    return { error: "User not found" };
  }

  if (target.role === "admin") {
    const [adminCount] = await db
      .select({ value: count() })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active")));

    if ((adminCount?.value ?? 0) <= 1) {
      return { error: "Cannot suspend the last admin" };
    }
  }

  const [row] = await db
    .update(schema.users)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(schema.users.id, targetId))
    .returning();

  return row ? { user: toUser(row) } : { error: "Failed to suspend user" };
}
