CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"node_id" uuid NOT NULL,
	"template_id" uuid,
	"allocation_id" uuid,
	"status" text DEFAULT 'offline' NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_servers_node_name" ON "servers" USING btree ("node_id","name");--> statement-breakpoint
CREATE INDEX "idx_servers_node_id" ON "servers" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "idx_servers_status" ON "servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_servers_template_id" ON "servers" USING btree ("template_id");