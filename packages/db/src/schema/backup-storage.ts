import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { nodes } from "./nodes";

export const backupStorageConfigs = pgTable(
  "backup_storage_configs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    backend: text("backend").notNull().default("local"),
    localPath: text("local_path"),
    s3Endpoint: text("s3_endpoint"),
    s3Bucket: text("s3_bucket"),
    s3AccessKey: text("s3_access_key"),
    s3SecretKey: text("s3_secret_key"),
    s3Region: text("s3_region"),
    maxBackupSizeGb: integer("max_backup_size_gb").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex("idx_backup_storage_node_id").on(t.nodeId)],
);
