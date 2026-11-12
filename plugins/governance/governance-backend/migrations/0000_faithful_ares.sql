CREATE SCHEMA IF NOT EXISTS "governance";
--> statement-breakpoint
CREATE TABLE "governance"."audit_event" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"event_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"previous_hash" text NOT NULL,
	"hash" text NOT NULL,
	"event" jsonb NOT NULL,
	CONSTRAINT "pk_audit_event" PRIMARY KEY("id"),
	CONSTRAINT "ck_audit_event_id" CHECK ("governance"."audit_event"."id" ~ '^aud_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_audit_event_org" CHECK ("governance"."audit_event"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_audit_event_version" CHECK ("governance"."audit_event"."version" > 0),
	CONSTRAINT "ck_audit_event_sequence" CHECK ("governance"."audit_event"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "governance"."audit_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "governance"."budget_constraint" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"policy_id" text NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "pk_budget_constraint" PRIMARY KEY("id"),
	CONSTRAINT "ck_budget_constraint_id" CHECK ("governance"."budget_constraint"."id" ~ '^bdg_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_budget_constraint_org" CHECK ("governance"."budget_constraint"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_budget_constraint_version" CHECK ("governance"."budget_constraint"."version" > 0),
	CONSTRAINT "ck_budget_constraint_scope" CHECK ("governance"."budget_constraint"."scope" in ('organization','team','project','member'))
);
--> statement-breakpoint
ALTER TABLE "governance"."budget_constraint" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "governance"."chain_checkpoint" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"sequence" bigint NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "pk_chain_checkpoint" PRIMARY KEY("id"),
	CONSTRAINT "ck_chain_checkpoint_id" CHECK ("governance"."chain_checkpoint"."id" ~ '^chk_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_chain_checkpoint_org" CHECK ("governance"."chain_checkpoint"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_chain_checkpoint_version" CHECK ("governance"."chain_checkpoint"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "governance"."chain_checkpoint" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "governance"."consumer_receipt" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"event_id" text NOT NULL,
	CONSTRAINT "pk_consumer_receipt" PRIMARY KEY("id"),
	CONSTRAINT "ck_consumer_receipt_id" CHECK ("governance"."consumer_receipt"."id" ~ '^rcp_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_consumer_receipt_org" CHECK ("governance"."consumer_receipt"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_consumer_receipt_version" CHECK ("governance"."consumer_receipt"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "governance"."consumer_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "governance"."outbox" (
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
	CONSTRAINT "ck_outbox_id" CHECK ("governance"."outbox"."id" ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_org" CHECK ("governance"."outbox"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_version" CHECK ("governance"."outbox"."version" > 0),
	CONSTRAINT "ck_outbox_state" CHECK ("governance"."outbox"."state" in ('pending','leased','delivered'))
);
--> statement-breakpoint
ALTER TABLE "governance"."outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "governance"."policy_version" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"policy_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "pk_policy_version" PRIMARY KEY("id"),
	CONSTRAINT "ck_policy_version_id" CHECK ("governance"."policy_version"."id" ~ '^pol_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_policy_version_org" CHECK ("governance"."policy_version"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_policy_version_version" CHECK ("governance"."policy_version"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "governance"."policy_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_audit_event_org_event" ON "governance"."audit_event" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_audit_event_org_sequence" ON "governance"."audit_event" USING btree ("org_id","sequence");--> statement-breakpoint
CREATE INDEX "ix_audit_event_org_created_id" ON "governance"."audit_event" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ix_budget_constraint_org_created_id" ON "governance"."budget_constraint" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_chain_checkpoint_org_sequence" ON "governance"."chain_checkpoint" USING btree ("org_id","sequence");--> statement-breakpoint
CREATE INDEX "ix_chain_checkpoint_org_created_id" ON "governance"."chain_checkpoint" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_consumer_receipt_org_event" ON "governance"."consumer_receipt" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "ix_consumer_receipt_org_created_id" ON "governance"."consumer_receipt" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_outbox_org_event" ON "governance"."outbox" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "ix_outbox_org_created_id" ON "governance"."outbox" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_policy_version_org_version" ON "governance"."policy_version" USING btree ("org_id","policy_version");--> statement-breakpoint
CREATE INDEX "ix_policy_version_org_created_id" ON "governance"."policy_version" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE POLICY "audit_event_org_isolation" ON "governance"."audit_event" AS PERMISSIVE FOR ALL TO public USING ("governance"."audit_event"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("governance"."audit_event"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "budget_constraint_org_isolation" ON "governance"."budget_constraint" AS PERMISSIVE FOR ALL TO public USING ("governance"."budget_constraint"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("governance"."budget_constraint"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "chain_checkpoint_org_isolation" ON "governance"."chain_checkpoint" AS PERMISSIVE FOR ALL TO public USING ("governance"."chain_checkpoint"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("governance"."chain_checkpoint"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "consumer_receipt_org_isolation" ON "governance"."consumer_receipt" AS PERMISSIVE FOR ALL TO public USING ("governance"."consumer_receipt"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("governance"."consumer_receipt"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "outbox_org_isolation" ON "governance"."outbox" AS PERMISSIVE FOR ALL TO public USING ("governance"."outbox"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("governance"."outbox"."org_id" = current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "policy_version_org_isolation" ON "governance"."policy_version" AS PERMISSIVE FOR ALL TO public USING ("governance"."policy_version"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("governance"."policy_version"."org_id" = current_setting('fasrun.org_id',true));