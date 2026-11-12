-- D-8 may have already provisioned the plugin schema before applying migrations.
CREATE SCHEMA IF NOT EXISTS "identity";
--> statement-breakpoint
CREATE TABLE "identity"."organization" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pk_organization" PRIMARY KEY("id"),
	CONSTRAINT "uq_organization_slug" UNIQUE("slug"),
	CONSTRAINT "ck_organization_id" CHECK ("identity"."organization"."id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_organization_org_id_self" CHECK ("identity"."organization"."org_id" = "identity"."organization"."id"),
	CONSTRAINT "ck_organization_name_length" CHECK (char_length("identity"."organization"."name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "identity"."organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ix_organization_org_created_id" ON "identity"."organization" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE POLICY "organization_org_isolation" ON "identity"."organization" AS PERMISSIVE FOR ALL TO public USING ("identity"."organization"."org_id" = current_setting('fasrun.org_id', true)) WITH CHECK ("identity"."organization"."org_id" = current_setting('fasrun.org_id', true));