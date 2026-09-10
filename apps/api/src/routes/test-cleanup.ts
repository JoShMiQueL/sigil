import { db, schema } from "@sigil/db";
import { ne, sql } from "drizzle-orm";
import { Hono } from "hono";

/**
 * Test-only cleanup endpoint.
 * Only registered when NODE_ENV is "test" or "development".
 * Never available in production — the guard is in index.ts.
 * Truncates all tables except the admin user so each test starts clean.
 * Preserves the E2E daemon node (started by Playwright globalSetup).
 */
const testCleanup = new Hono();

testCleanup.post("/cleanup", async (c) => {
  // Delete allocations except those on the E2E daemon node
  await db
    .delete(schema.allocations)
    .where(
      sql`${schema.allocations.nodeId} NOT IN (SELECT id FROM ${schema.nodes} WHERE hostname = 'e2e-daemon')`,
    );
  await db.delete(schema.variables);
  await db.delete(schema.templates);
  await db.delete(schema.registries);
  // Preserve the E2E daemon node and its credentials (started by globalSetup)
  await db
    .delete(schema.nodeCredentials)
    .where(
      sql`${schema.nodeCredentials.nodeId} NOT IN (SELECT id FROM ${schema.nodes} WHERE hostname = 'e2e-daemon')`,
    );
  await db.delete(schema.pairingTokens);
  await db.delete(schema.nodes).where(ne(schema.nodes.hostname, "e2e-daemon"));
  await db.delete(schema.regions).where(ne(schema.regions.name, "e2e-daemon-region"));
  await db.delete(schema.apiKeys);
  await db.delete(schema.auditLogs);
  await db.delete(schema.passwordResetTokens);
  await db.delete(schema.sessions);
  await db.delete(schema.users).where(ne(schema.users.email, "admin@sigil.local"));

  return c.json({ status: "ok" });
});

export default testCleanup;
