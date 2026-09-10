import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { regions } from "./regions";

export const nodes = pgTable("nodes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  regionId: uuid("region_id")
    .notNull()
    .references(() => regions.id, { onDelete: "restrict" }),
  hostname: text("hostname").notNull(),
  ipAddress: text("ip_address").notNull(),
  displayName: text("display_name").notNull(),
  capabilities: jsonb("capabilities").notNull().default(sql`'{}'`),
  status: text("status").notNull().default("unknown"),
  cpuUsage: real("cpu_usage"),
  memoryUsage: real("memory_usage"),
  diskUsage: real("disk_usage"),
  containerCount: integer("container_count"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  primaryIp: text("primary_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
