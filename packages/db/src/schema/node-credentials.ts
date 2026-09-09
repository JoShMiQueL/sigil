import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { nodes } from "./nodes";

export const nodeCredentials = pgTable("node_credentials", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: uuid("node_id")
    .notNull()
    .references(() => nodes.id, { onDelete: "cascade" }),
  secretEncrypted: text("secret_encrypted").notNull(),
  secretId: text("secret_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
