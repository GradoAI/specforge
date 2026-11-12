CREATE SCHEMA IF NOT EXISTS "knowledge";
--> statement-breakpoint
CREATE TABLE "knowledge"."organization_rule" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"definition_key" text NOT NULL,
	"definition_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"is_customized" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pk_organization_rule" PRIMARY KEY("id"),
	CONSTRAINT "ck_organization_rule_id" CHECK ("knowledge"."organization_rule"."id" ~ '^orl_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_organization_rule_org" CHECK ("knowledge"."organization_rule"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_organization_rule_version" CHECK ("knowledge"."organization_rule"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."organization_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge"."project_config_cache" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"repository_id" text NOT NULL,
	"base_commit" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "pk_project_config_cache" PRIMARY KEY("id"),
	CONSTRAINT "ck_project_config_cache_id" CHECK ("knowledge"."project_config_cache"."id" ~ '^cfg_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_project_config_cache_org" CHECK ("knowledge"."project_config_cache"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_project_config_cache_version" CHECK ("knowledge"."project_config_cache"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."project_config_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge"."spec_template" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"definition_key" text NOT NULL,
	"definition_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"is_customized" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pk_spec_template" PRIMARY KEY("id"),
	CONSTRAINT "ck_spec_template_id" CHECK ("knowledge"."spec_template"."id" ~ '^spt_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_spec_template_org" CHECK ("knowledge"."spec_template"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_spec_template_version" CHECK ("knowledge"."spec_template"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."spec_template" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge"."workflow_definition" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"definition_key" text NOT NULL,
	"definition_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"is_customized" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pk_workflow_definition" PRIMARY KEY("id"),
	CONSTRAINT "ck_workflow_definition_id" CHECK ("knowledge"."workflow_definition"."id" ~ '^wfd_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_workflow_definition_org" CHECK ("knowledge"."workflow_definition"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_workflow_definition_version" CHECK ("knowledge"."workflow_definition"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge"."workflow_definition" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_organization_rule_org_identity" ON "knowledge"."organization_rule" USING btree ("org_id","definition_key","definition_version");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_project_config_cache_org_identity" ON "knowledge"."project_config_cache" USING btree ("org_id","repository_id","base_commit");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_spec_template_org_identity" ON "knowledge"."spec_template" USING btree ("org_id","definition_key","definition_version");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_workflow_definition_org_identity" ON "knowledge"."workflow_definition" USING btree ("org_id","definition_key","definition_version");--> statement-breakpoint
CREATE POLICY "organization_rule_org_isolation" ON "knowledge"."organization_rule" AS PERMISSIVE FOR ALL TO public USING ("knowledge"."organization_rule"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("knowledge"."organization_rule"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "project_config_cache_org_isolation" ON "knowledge"."project_config_cache" AS PERMISSIVE FOR ALL TO public USING ("knowledge"."project_config_cache"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("knowledge"."project_config_cache"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "spec_template_org_isolation" ON "knowledge"."spec_template" AS PERMISSIVE FOR ALL TO public USING ("knowledge"."spec_template"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("knowledge"."spec_template"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "workflow_definition_org_isolation" ON "knowledge"."workflow_definition" AS PERMISSIVE FOR ALL TO public USING ("knowledge"."workflow_definition"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("knowledge"."workflow_definition"."org_id" = current_setting('fasrun.org_id',true));