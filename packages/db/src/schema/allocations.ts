import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { nodes } from "./nodes";

export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    ip: text("ip").notNull(),
    port: integer("port").notNull(),
    protocol: text("protocol").notNull().default("tcp"),
    status: text("status").notNull().default("available"),
    serverId: uuid("server_id"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("allocations_node_ip_port_protocol_idx").on(t.nodeId, t.ip, t.port, t.protocol),
    index("allocations_node_status_idx").on(t.nodeId, t.status),
    index("allocations_node_ip_idx").on(t.nodeId, t.ip),
    index("allocations_node_port_idx").on(t.nodeId, t.port),
    index("allocations_server_id_idx").on(t.serverId),
  ],
);
