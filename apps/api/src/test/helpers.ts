import { db, schema } from "@sigilpanel/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "../lib/argon2";
import { computeSignature, generateNodeSecret, generateSecretId } from "../lib/credentials";
import { encrypt } from "../lib/crypto";
import { createResetToken } from "../services/password.service";

export async function cleanupDatabase(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE variables, templates, groups, registries, node_credentials, pairing_tokens, nodes, regions, audit_logs, sessions, api_keys, password_reset_tokens, users CASCADE`,
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

// Parse JSON response body (typed for test convenience)
// biome-ignore lint/suspicious/noExplicitAny: test helper needs flexible return type
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
  if (options.cookie) headers.Cookie = options.cookie;
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

// Create a region and return its id
export async function createRegion(name = "test-region"): Promise<string> {
  const [row] = await db
    .insert(schema.regions)
    .values({ name, description: "Test region" })
    .returning();
  return row.id;
}

// Create a node in a region and return its id
export async function createNode(
  regionId: string,
  hostname = "node-01.test.local",
): Promise<string> {
  const [row] = await db
    .insert(schema.nodes)
    .values({
      regionId,
      hostname,
      ipAddress: "203.0.113.10",
      displayName: hostname,
      capabilities: { docker: true, sftp: true },
      status: "unknown",
    })
    .returning();
  return row.id;
}

// Create node credentials and return { nodeId, secretId, secret }
export async function createNodeCredentials(nodeId: string): Promise<{
  nodeId: string;
  secretId: string;
  secret: string;
}> {
  const secretId = generateSecretId();
  const secret = generateNodeSecret();
  await db.insert(schema.nodeCredentials).values({
    nodeId,
    secretId,
    secretEncrypted: encrypt(secret),
  });
  return { nodeId, secretId, secret };
}

// Revoke node credentials
export async function revokeNodeCredentials(nodeId: string): Promise<void> {
  await db
    .update(schema.nodeCredentials)
    .set({ revokedAt: new Date() })
    .where(eq(schema.nodeCredentials.nodeId, nodeId));
}

// Build valid auth headers for a node
export function buildNodeAuthHeaders(
  secretId: string,
  secret: string,
  body: string,
  timestamp?: number,
): Record<string, string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = computeSignature(secret, ts, body);
  return {
    "x-node-id": secretId,
    "x-node-signature": signature,
    "x-node-timestamp": String(ts),
  };
}
