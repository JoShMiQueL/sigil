import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { allocations } from "./allocations";
import { nodes } from "./nodes";
import { templates } from "./templates";

export const servers = pgTable(
  "servers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: "set null" }),
    allocationId: uuid("allocation_id").references(() => allocations.id, { onDelete: "set null" }),
    status: text("status").notNull().default("offline"),
    config: jsonb("config").notNull().default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("idx_servers_node_name").on(t.nodeId, t.name),
    index("idx_servers_node_id").on(t.nodeId),
    index("idx_servers_status").on(t.status),
    index("idx_servers_template_id").on(t.templateId),
  ],
);
