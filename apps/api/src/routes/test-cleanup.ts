import { db, schema } from "@sigilpanel/db";
import { ne } from "drizzle-orm";
import { Hono } from "hono";

/**
 * Test-only cleanup endpoint.
 * Only registered when RATE_LIMIT_DISABLED=1 (E2E test mode).
 * Truncates all tables except the admin user so each test starts clean.
 *
 * In CI: service containers give a fresh DB per job, this keeps tests
 * isolated from each other within the same run.
 * In local: dev compose is persistent, this prevents test pollution.
 */
const testCleanup = new Hono();

testCleanup.post("/cleanup", async (c) => {
  // Delete all users except admin, truncate dependent tables first
  await db.delete(schema.apiKeys);
  await db.delete(schema.auditLogs);
  await db.delete(schema.passwordResetTokens);
  await db.delete(schema.sessions);
  await db.delete(schema.users).where(ne(schema.users.email, "admin@sigilpanel.local"));

  return c.json({ status: "ok" });
});

export default testCleanup;
