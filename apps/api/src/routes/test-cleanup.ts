import { db, schema } from "@sigilpanel/db";
import { ne } from "drizzle-orm";
import { Hono } from "hono";

/**
 * Test-only cleanup endpoint.
 * Only registered when NODE_ENV is "test" or "development".
 * Never available in production — the guard is in index.ts.
 * Truncates all tables except the admin user so each test starts clean.
 */
const testCleanup = new Hono();

testCleanup.post("/cleanup", async (c) => {
  await db.delete(schema.apiKeys);
  await db.delete(schema.auditLogs);
  await db.delete(schema.passwordResetTokens);
  await db.delete(schema.sessions);
  await db.delete(schema.users).where(ne(schema.users.email, "admin@sigilpanel.local"));

  return c.json({ status: "ok" });
});

export default testCleanup;
