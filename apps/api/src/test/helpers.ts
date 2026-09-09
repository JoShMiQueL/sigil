import { db, schema } from "@sigilpanel/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "../lib/argon2";
import { createResetToken } from "../services/password.service";

export async function cleanupDatabase(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE audit_logs, sessions, api_keys, password_reset_tokens, users CASCADE`,
  );
}

export async function createAdmin(
  email = "admin@test.local",
  password = "admin12345",
): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({
      email,
      username: email.split("@")[0],
      passwordHash: await hashPassword(password),
      role: "admin",
      status: "active",
    })
    .returning();
  return row.id;
}

export async function createUser(
  email: string,
  password = "userpass123",
  role: "user" | "admin" = "user",
): Promise<string> {
  const [row] = await db
    .insert(schema.users)
    .values({
      email,
      username: email.split("@")[0],
      passwordHash: await hashPassword(password),
      role,
      status: "active",
    })
    .returning();
  return row.id;
}

export async function suspendUser(userId: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

// Extract session cookie from a Response and return it as a Cookie header value
export function extractCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/sigil_session=([^;]+)/);
  return match ? `sigil_session=${match[1]}` : null;
}

// Parse JSON response body (typed as any for test convenience)
export async function parseJson(res: Response): Promise<any> {
  return res.json();
}

// Make a request to the Hono app and return the Response
export async function apiRequest(
  app: { request: (path: string, init?: RequestInit) => Promise<Response> | Response },
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string | null;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.cookie) headers["Cookie"] = options.cookie;
  if (options.body) headers["Content-Type"] = "application/json";

  return Promise.resolve(
    app.request(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

export async function loginAndGetCookie(
  app: { request: (path: string, init?: RequestInit) => Promise<Response> | Response },
  email: string,
  password: string,
): Promise<{ cookie: string | null; res: Response }> {
  const res = await apiRequest(app, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return { cookie: extractCookie(res), res };
}

// Generate a reset token for a user and return the raw token
export async function generateResetToken(userId: string): Promise<string> {
  const { token } = await createResetToken(userId);
  return token;
}

// Generate a valid TOTP code from a secret
export function generateTotpCode(secret: string): string {
  const { authenticator } = require("@otplib/preset-default");
  return authenticator.generate(secret);
}
