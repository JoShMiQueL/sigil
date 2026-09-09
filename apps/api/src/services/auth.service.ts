import { db, schema } from "@sigilpanel/db";
import type { User } from "@sigilpanel/shared";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { verifyPassword } from "../lib/argon2";
import { generateToken } from "../lib/token";

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

export async function login(
  email: string,
  password: string,
  ipAddress: string,
  userAgent: string | undefined,
  c: Context,
): Promise<{ user: User } | { error: "invalid_credentials" | "suspended" | "2fa_required" }> {
  const [userRow] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!userRow) {
    return { error: "invalid_credentials" };
  }

  const valid = await verifyPassword(userRow.passwordHash, password);
  if (!valid) {
    return { error: "invalid_credentials" };
  }

  if (userRow.status === "suspended") {
    return { error: "suspended" };
  }

  if (userRow.totpEnabled) {
    const challenge = generateToken(16);
    // Store challenge in Redis for TOTP verification (implemented in US4)
    return { error: "2fa_required" };
  }

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 1000);

  await db.insert(schema.sessions).values({
    userId: userRow.id,
    token,
    ipAddress,
    userAgent: userAgent ?? null,
    expiresAt,
  });

  setCookie(c, "sigil_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });

  return { user: toUser(userRow) };
}

export async function logout(c: Context): Promise<void> {
  const token = getCookie(c, "sigil_session");
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
    deleteCookie(c, "sigil_session", { path: "/" });
  }
}

export async function getCurrentUser(token: string): Promise<User | null> {
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  const [userRow] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  if (!userRow || userRow.status !== "active") {
    return null;
  }

  return toUser(userRow);
}
