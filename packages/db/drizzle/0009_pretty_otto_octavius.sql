CREATE TABLE "server_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"can_console" boolean DEFAULT false NOT NULL,
	"can_files" boolean DEFAULT false NOT NULL,
	"can_backups" boolean DEFAULT false NOT NULL,
	"can_power" boolean DEFAULT false NOT NULL,
	"can_settings" boolean DEFAULT false NOT NULL,
	"can_members" boolean DEFAULT false NOT NULL,
	"can_allocations" boolean DEFAULT false NOT NULL,
	"can_databases" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_server_members_server_user" ON "server_members" USING btree ("server_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_server_members_user_id" ON "server_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_server_members_server_id" ON "server_members" USING btree ("server_id");