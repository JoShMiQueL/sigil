import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { nodes } from "./nodes";
import { servers } from "./servers";

export const backups = pgTable(
  "backups",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("pending"),
    storageLocation: text("storage_location").notNull().default("local"),
    checksum: text("checksum"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_backups_server_id").on(t.serverId),
    index("idx_backups_node_id").on(t.nodeId),
    index("idx_backups_status").on(t.status),
  ],
);
