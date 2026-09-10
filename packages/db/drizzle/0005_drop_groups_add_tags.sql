-- Drop FK constraint from templates to groups
ALTER TABLE "templates" DROP CONSTRAINT "templates_group_id_groups_id_fk";--> statement-breakpoint
-- Add tags column to templates
ALTER TABLE "templates" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Drop group_id column from templates
ALTER TABLE "templates" DROP COLUMN "group_id";--> statement-breakpoint
-- Drop groups table
DROP TABLE "groups";--> statement-breakpoint
