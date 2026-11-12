CREATE SCHEMA IF NOT EXISTS "environment";
--> statement-breakpoint
CREATE TABLE "environment"."template_version" (
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
	CONSTRAINT "pk_template_version" PRIMARY KEY("id"),
	CONSTRAINT "ck_template_version_id" CHECK ("environment"."template_version"."id" ~ '^env_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_template_version_org" CHECK ("environment"."template_version"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_template_version_version" CHECK ("environment"."template_version"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "environment"."template_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_template_version_org_identity" ON "environment"."template_version" USING btree ("org_id","definition_key","definition_version");--> statement-breakpoint
CREATE POLICY "template_version_org_isolation" ON "environment"."template_version" AS PERMISSIVE FOR ALL TO public USING ("environment"."template_version"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("environment"."template_version"."org_id" = current_setting('fasrun.org_id',true));