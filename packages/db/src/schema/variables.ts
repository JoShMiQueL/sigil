import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { templates } from "./templates";

export const variables = pgTable("variables", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  envVar: text("env_var").notNull(),
  dataType: text("data_type").notNull(),
  defaultValue: text("default_value").notNull(),
  required: boolean("required").notNull().default(false),
  minValue: integer("min_value"),
  maxValue: integer("max_value"),
  minLength: integer("min_length"),
  maxLength: integer("max_length"),
  regexPattern: text("regex_pattern"),
  allowedValues: jsonb("allowed_values"),
  visibility: text("visibility").notNull().default("editable"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
