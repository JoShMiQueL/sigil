import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { registries } from "./registries";

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  registryId: uuid("registry_id").references(() => registries.id, { onDelete: "set null" }),
  sourceId: text("source_id"),
  sourceHash: text("source_hash"),
  name: text("name").notNull(),
  description: text("description"),
  author: text("author"),
  version: text("version").notNull().default("1.0.0"),
  image: text("image").notNull(),
  startupCommand: text("startup_command").notNull(),
  stopSignal: text("stop_signal").notNull().default("^C"),
  environment: jsonb("environment").notNull().default(sql`'{}'`),
  portMappings: jsonb("port_mappings").notNull().default(sql`'[]'`),
  resourceLimits: jsonb("resource_limits").notNull(),
  resourceLimitsRange: jsonb("resource_limits_range"),
  changelog: jsonb("changelog").notNull().default(sql`'[]'`),
  tags: text("tags").array().notNull().default(sql`'{}'`),
  active: boolean("active").notNull().default(false),
  customized: boolean("customized").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
