import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { servers } from "./servers";
import { users } from "./users";

export const serverMembers = pgTable(
  "server_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    canConsole: boolean("can_console").notNull().default(false),
    canFiles: boolean("can_files").notNull().default(false),
    canBackups: boolean("can_backups").notNull().default(false),
    canPower: boolean("can_power").notNull().default(false),
    canSettings: boolean("can_settings").notNull().default(false),
    canMembers: boolean("can_members").notNull().default(false),
    canAllocations: boolean("can_allocations").notNull().default(false),
    canDatabases: boolean("can_databases").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("idx_server_members_server_user").on(t.serverId, t.userId),
    index("idx_server_members_user_id").on(t.userId),
    index("idx_server_members_server_id").on(t.serverId),
  ],
);
