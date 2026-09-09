import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { nodes } from "./nodes";
import { regions } from "./regions";
import { users } from "./users";

export const pairingTokens = pgTable("pairing_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull().unique(),
  regionId: uuid("region_id")
    .notNull()
    .references(() => regions.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByNodeId: uuid("used_by_node_id").references(() => nodes.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});
