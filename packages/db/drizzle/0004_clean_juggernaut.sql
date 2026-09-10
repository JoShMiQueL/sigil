CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "registries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"auth_method" text DEFAULT 'none' NOT NULL,
	"token" text,
	"username" text,
	"password" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"is_official" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registries_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"registry_id" uuid,
	"source_id" text,
	"source_hash" text,
	"name" text NOT NULL,
	"description" text,
	"author" text,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"image" text NOT NULL,
	"startup_command" text NOT NULL,
	"stop_signal" text DEFAULT '^C' NOT NULL,
	"environment" jsonb DEFAULT '{}' NOT NULL,
	"port_mappings" jsonb DEFAULT '[]' NOT NULL,
	"resource_limits" jsonb NOT NULL,
	"resource_limits_range" jsonb,
	"changelog" jsonb DEFAULT '[]' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"customized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"env_var" text NOT NULL,
	"data_type" text NOT NULL,
	"default_value" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"min_value" integer,
	"max_value" integer,
	"min_length" integer,
	"max_length" integer,
	"regex_pattern" text,
	"allowed_values" jsonb,
	"visibility" text DEFAULT 'editable' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_registry_id_registries_id_fk" FOREIGN KEY ("registry_id") REFERENCES "public"."registries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variables" ADD CONSTRAINT "variables_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;