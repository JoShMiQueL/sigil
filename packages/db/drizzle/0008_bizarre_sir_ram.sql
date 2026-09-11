CREATE TABLE "backup_storage_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"backend" text DEFAULT 'local' NOT NULL,
	"local_path" text,
	"s3_endpoint" text,
	"s3_bucket" text,
	"s3_access_key" text,
	"s3_secret_key" text,
	"s3_region" text,
	"max_backup_size_gb" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_location" text DEFAULT 'local' NOT NULL,
	"checksum" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "backup_storage_configs" ADD CONSTRAINT "backup_storage_configs_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_backup_storage_node_id" ON "backup_storage_configs" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "idx_backups_server_id" ON "backups" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "idx_backups_node_id" ON "backups" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "idx_backups_status" ON "backups" USING btree ("status");