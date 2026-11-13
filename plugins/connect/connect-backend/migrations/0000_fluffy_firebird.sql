CREATE SCHEMA IF NOT EXISTS "connect";
--> statement-breakpoint
CREATE TABLE "connect"."consumer_receipt" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"event_id" text NOT NULL,
	"consumer" text NOT NULL,
	CONSTRAINT "pk_consumer_receipt" PRIMARY KEY("id"),
	CONSTRAINT "ck_consumer_receipt_id" CHECK ("connect"."consumer_receipt"."id" ~ '^rcp_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_consumer_receipt_org" CHECK ("connect"."consumer_receipt"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_consumer_receipt_version" CHECK ("connect"."consumer_receipt"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "connect"."consumer_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."credential_envelope" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"integration_id" text NOT NULL,
	"credential_version" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "pk_credential_envelope" PRIMARY KEY("id"),
	CONSTRAINT "ck_credential_envelope_id" CHECK ("connect"."credential_envelope"."id" ~ '^cre_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_credential_envelope_org" CHECK ("connect"."credential_envelope"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_credential_envelope_version" CHECK ("connect"."credential_envelope"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "connect"."credential_envelope" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."discussion" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"integration_id" text NOT NULL,
	"external_id" text NOT NULL,
	"repository_id" text NOT NULL,
	CONSTRAINT "pk_discussion" PRIMARY KEY("id"),
	CONSTRAINT "ck_discussion_id" CHECK ("connect"."discussion"."id" ~ '^dsc_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_discussion_org" CHECK ("connect"."discussion"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_discussion_version" CHECK ("connect"."discussion"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "connect"."discussion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."external_object" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"integration_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"digest" text NOT NULL,
	CONSTRAINT "pk_external_object" PRIMARY KEY("id"),
	CONSTRAINT "ck_external_object_id" CHECK ("connect"."external_object"."id" ~ '^ext_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_external_object_org" CHECK ("connect"."external_object"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_external_object_version" CHECK ("connect"."external_object"."version" > 0),
	CONSTRAINT "ck_external_object_kind" CHECK ("connect"."external_object"."kind" in ('issue','pull_request','review','discussion'))
);
--> statement-breakpoint
ALTER TABLE "connect"."external_object" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."inbox" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"installation_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"receipt" jsonb NOT NULL,
	CONSTRAINT "pk_inbox" PRIMARY KEY("id"),
	CONSTRAINT "ck_inbox_id" CHECK ("connect"."inbox"."id" ~ '^inb_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_inbox_org" CHECK ("connect"."inbox"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_inbox_version" CHECK ("connect"."inbox"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "connect"."inbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."integration" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"installation_id" text NOT NULL,
	"provider" text NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "pk_integration" PRIMARY KEY("id"),
	CONSTRAINT "ck_integration_id" CHECK ("connect"."integration"."id" ~ '^int_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_integration_org" CHECK ("connect"."integration"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_integration_version" CHECK ("connect"."integration"."version" > 0),
	CONSTRAINT "ck_integration_provider" CHECK ("connect"."integration"."provider" = 'github')
);
--> statement-breakpoint
ALTER TABLE "connect"."integration" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."outbound_action" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"integration_id" text NOT NULL,
	"action_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"target" text NOT NULL,
	"state" text NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"retry_at" timestamp with time zone,
	"result" jsonb,
	CONSTRAINT "pk_outbound_action" PRIMARY KEY("id"),
	CONSTRAINT "ck_outbound_action_id" CHECK ("connect"."outbound_action"."id" ~ '^act_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbound_action_org" CHECK ("connect"."outbound_action"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbound_action_version" CHECK ("connect"."outbound_action"."version" > 0),
	CONSTRAINT "ck_outbound_action_state" CHECK ("connect"."outbound_action"."state" in ('pending','succeeded','failed','unknown'))
);
--> statement-breakpoint
ALTER TABLE "connect"."outbound_action" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."outbox" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"event_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "pk_outbox" PRIMARY KEY("id"),
	CONSTRAINT "ck_outbox_id" CHECK ("connect"."outbox"."id" ~ '^obx_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_org" CHECK ("connect"."outbox"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_version" CHECK ("connect"."outbox"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "connect"."outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."reconcile_cursor" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"integration_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"cursor" text,
	"high_watermark" timestamp with time zone,
	CONSTRAINT "pk_reconcile_cursor" PRIMARY KEY("id"),
	CONSTRAINT "ck_reconcile_cursor_id" CHECK ("connect"."reconcile_cursor"."id" ~ '^cur_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_reconcile_cursor_org" CHECK ("connect"."reconcile_cursor"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_reconcile_cursor_version" CHECK ("connect"."reconcile_cursor"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "connect"."reconcile_cursor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connect"."repository_binding" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"integration_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "pk_repository_binding" PRIMARY KEY("id"),
	CONSTRAINT "ck_repository_binding_id" CHECK ("connect"."repository_binding"."id" ~ '^rpb_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_repository_binding_org" CHECK ("connect"."repository_binding"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_repository_binding_version" CHECK ("connect"."repository_binding"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "connect"."repository_binding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_consumer_receipt_identity" ON "connect"."consumer_receipt" USING btree ("org_id","event_id","consumer");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_credential_envelope_identity" ON "connect"."credential_envelope" USING btree ("org_id","integration_id","credential_version");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_discussion_identity" ON "connect"."discussion" USING btree ("org_id","integration_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_external_object_identity" ON "connect"."external_object" USING btree ("org_id","integration_id","external_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_inbox_identity" ON "connect"."inbox" USING btree ("org_id","installation_id","delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_integration_identity" ON "connect"."integration" USING btree ("org_id","installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_outbound_action_identity" ON "connect"."outbound_action" USING btree ("org_id","action_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_outbox_identity" ON "connect"."outbox" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_reconcile_cursor_identity" ON "connect"."reconcile_cursor" USING btree ("org_id","integration_id","repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_repository_binding_identity" ON "connect"."repository_binding" USING btree ("org_id","integration_id","repository_id");--> statement-breakpoint
CREATE POLICY "consumer_receipt_org_isolation" ON "connect"."consumer_receipt" AS PERMISSIVE FOR ALL TO public USING ("connect"."consumer_receipt"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."consumer_receipt"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "credential_envelope_org_isolation" ON "connect"."credential_envelope" AS PERMISSIVE FOR ALL TO public USING ("connect"."credential_envelope"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."credential_envelope"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "discussion_org_isolation" ON "connect"."discussion" AS PERMISSIVE FOR ALL TO public USING ("connect"."discussion"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."discussion"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "external_object_org_isolation" ON "connect"."external_object" AS PERMISSIVE FOR ALL TO public USING ("connect"."external_object"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."external_object"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "inbox_org_isolation" ON "connect"."inbox" AS PERMISSIVE FOR ALL TO public USING ("connect"."inbox"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."inbox"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "integration_org_isolation" ON "connect"."integration" AS PERMISSIVE FOR ALL TO public USING ("connect"."integration"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."integration"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "outbound_action_org_isolation" ON "connect"."outbound_action" AS PERMISSIVE FOR ALL TO public USING ("connect"."outbound_action"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."outbound_action"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "outbox_org_isolation" ON "connect"."outbox" AS PERMISSIVE FOR ALL TO public USING ("connect"."outbox"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."outbox"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "reconcile_cursor_org_isolation" ON "connect"."reconcile_cursor" AS PERMISSIVE FOR ALL TO public USING ("connect"."reconcile_cursor"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."reconcile_cursor"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "repository_binding_org_isolation" ON "connect"."repository_binding" AS PERMISSIVE FOR ALL TO public USING ("connect"."repository_binding"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("connect"."repository_binding"."org_id" = current_setting('fasrun.org_id',true));
--> statement-breakpoint
CREATE UNIQUE INDEX "ix_credential_envelope_active" ON "connect"."credential_envelope" USING btree ("org_id","integration_id") WHERE "connect"."credential_envelope"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "ix_integration_installation" ON "connect"."integration" USING btree ("installation_id");