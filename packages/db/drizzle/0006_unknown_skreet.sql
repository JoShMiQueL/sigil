CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"ip" text NOT NULL,
	"port" integer NOT NULL,
	"protocol" text DEFAULT 'tcp' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"server_id" uuid,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "primary_ip" text;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_node_ip_port_protocol_idx" ON "allocations" USING btree ("node_id","ip","port","protocol");--> statement-breakpoint
CREATE INDEX "allocations_node_status_idx" ON "allocations" USING btree ("node_id","status");--> statement-breakpoint
CREATE INDEX "allocations_node_ip_idx" ON "allocations" USING btree ("node_id","ip");--> statement-breakpoint
CREATE INDEX "allocations_node_port_idx" ON "allocations" USING btree ("node_id","port");--> statement-breakpoint
CREATE INDEX "allocations_server_id_idx" ON "allocations" USING btree ("server_id");