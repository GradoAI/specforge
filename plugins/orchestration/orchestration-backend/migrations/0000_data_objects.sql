CREATE SCHEMA IF NOT EXISTS "orchestration";
--> statement-breakpoint
CREATE TABLE "orchestration"."data_object" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"object_id" text NOT NULL,
	"category" text NOT NULL,
	"version_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"byte_length" integer NOT NULL,
	"object" jsonb NOT NULL,
	CONSTRAINT "pk_data_object" PRIMARY KEY("id"),
	CONSTRAINT "ck_data_object_id" CHECK ("orchestration"."data_object"."id" ~ '^dat_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_data_object_org" CHECK ("orchestration"."data_object"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_data_object_object_id" CHECK ("orchestration"."data_object"."object_id" ~ '^obj_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_data_object_version" CHECK ("orchestration"."data_object"."version" > 0),
	CONSTRAINT "ck_data_object_length" CHECK ("orchestration"."data_object"."byte_length" >= 0),
	CONSTRAINT "ck_data_object_hash" CHECK ("orchestration"."data_object"."content_hash" ~ '^[a-f0-9]{64}$' AND "orchestration"."data_object"."version_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "orchestration"."data_object" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orchestration"."outbox" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"event_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_outbox" PRIMARY KEY("id"),
	CONSTRAINT "ck_outbox_id" CHECK ("orchestration"."outbox"."id" ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_org" CHECK ("orchestration"."outbox"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_version" CHECK ("orchestration"."outbox"."version" > 0),
	CONSTRAINT "ck_outbox_state" CHECK ("orchestration"."outbox"."state" in ('pending','leased','delivered'))
);
--> statement-breakpoint
ALTER TABLE "orchestration"."outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_data_object_org_identity" ON "orchestration"."data_object" USING btree ("org_id","category","object_id","version_hash");--> statement-breakpoint
CREATE INDEX "ix_data_object_org_created_id" ON "orchestration"."data_object" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_outbox_org_event" ON "orchestration"."outbox" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "ix_outbox_org_created_id" ON "orchestration"."outbox" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE POLICY "data_object_org_isolation" ON "orchestration"."data_object" AS PERMISSIVE FOR ALL TO public USING ("orchestration"."data_object"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("orchestration"."data_object"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "outbox_org_isolation" ON "orchestration"."outbox" AS PERMISSIVE FOR ALL TO public USING ("orchestration"."outbox"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("orchestration"."outbox"."org_id" = current_setting('fasrun.org_id',true));
ALTER TABLE orchestration.data_object FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE orchestration.data_object IS 'Tenant-isolated orchestration.data_object records';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.id IS 'Owner-managed id';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.org_id IS 'Owner-managed org_id';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.created_at IS 'Owner-managed created_at';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.updated_at IS 'Owner-managed updated_at';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.created_by IS 'Owner-managed created_by';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.version IS 'Owner-managed version';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.object_id IS 'Owner-managed object_id';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.category IS 'Owner-managed category';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.version_hash IS 'Owner-managed version_hash';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.content_hash IS 'Owner-managed content_hash';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.byte_length IS 'Owner-managed byte_length';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.data_object.object IS 'Owner-managed object';
--> statement-breakpoint

ALTER TABLE orchestration.outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE orchestration.outbox IS 'Tenant-isolated orchestration.outbox records';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.id IS 'Owner-managed id';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.org_id IS 'Owner-managed org_id';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.created_at IS 'Owner-managed created_at';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.updated_at IS 'Owner-managed updated_at';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.created_by IS 'Owner-managed created_by';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.version IS 'Owner-managed version';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.event_id IS 'Owner-managed event_id';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.event IS 'Owner-managed event';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.state IS 'Owner-managed state';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.lease_token IS 'Owner-managed lease_token';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.lease_until IS 'Owner-managed lease_until';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.retry_at IS 'Owner-managed retry_at';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.outbox.attempts IS 'Owner-managed attempts';
--> statement-breakpoint
CREATE FUNCTION orchestration.reject_data_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable data reference' USING ERRCODE='55000'; END; $$;
--> statement-breakpoint
CREATE TRIGGER data_object_immutable BEFORE UPDATE OR DELETE ON orchestration.data_object FOR EACH ROW EXECUTE FUNCTION orchestration.reject_data_change();
--> statement-breakpoint
CREATE TRIGGER data_object_no_truncate BEFORE TRUNCATE ON orchestration.data_object FOR EACH STATEMENT EXECUTE FUNCTION orchestration.reject_data_change();
