CREATE TABLE "orchestration"."agent_call" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"call_id" text NOT NULL,
	"work_id" text NOT NULL,
	"step_run_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"request_hash" text NOT NULL,
	"state" text NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"record" jsonb NOT NULL,
	CONSTRAINT "pk_agent_call" PRIMARY KEY("id"),
	CONSTRAINT "ck_agent_call_id" CHECK ("orchestration"."agent_call"."id" ~ '^acl_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_agent_call_org" CHECK ("orchestration"."agent_call"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_agent_call_version" CHECK ("orchestration"."agent_call"."version" > 0),
	CONSTRAINT "ck_agent_call_attempt" CHECK ("orchestration"."agent_call"."attempt" > 0),
	CONSTRAINT "ck_agent_call_state" CHECK ("orchestration"."agent_call"."state" in ('pending','success','failed','cancelled')),
	CONSTRAINT "ck_agent_call_hash" CHECK ("orchestration"."agent_call"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "orchestration"."agent_call" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ix_agent_call_org_call_attempt" ON "orchestration"."agent_call" USING btree ("org_id","call_id","attempt");--> statement-breakpoint
CREATE INDEX "ix_agent_call_org_created_id" ON "orchestration"."agent_call" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE POLICY "agent_call_org_isolation" ON "orchestration"."agent_call" AS PERMISSIVE FOR ALL TO public USING ("orchestration"."agent_call"."org_id" = current_setting('fasrun.org_id',true)) WITH CHECK ("orchestration"."agent_call"."org_id" = current_setting('fasrun.org_id',true));
--> statement-breakpoint
ALTER TABLE orchestration.agent_call FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE orchestration.agent_call IS 'Tenant-isolated durable agent attempts with immutable terminal results';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.id IS 'Prefixed ULID of this immutable call attempt';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.org_id IS 'Tenant organization owning the call and enforcing row isolation';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.created_at IS 'First durable registration timestamp of this attempt';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.updated_at IS 'Latest pending-to-terminal transition timestamp';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.created_by IS 'Actor identifier that created this attempt';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.version IS 'Optimistic record revision incremented on terminal transition';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.call_id IS 'Stable logical invocation identifier reused across attempts';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.work_id IS 'Owning work identifier without cross-domain foreign key';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.step_run_id IS 'Owning version-pinned workflow step run identifier';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.attempt IS 'Positive monotonic attempt number within one logical call';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.request_hash IS 'SHA256 of the canonical original call request for idempotency conflicts';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.state IS 'Pending or immutable success, failed, cancelled terminal state';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.deadline IS 'First effective absolute deadline bounded by call and step timeout';
--> statement-breakpoint
COMMENT ON COLUMN orchestration.agent_call.record IS 'Version-pinned call snapshot, effective deadline, provenance, and validated terminal result';
--> statement-breakpoint
CREATE FUNCTION orchestration.guard_agent_call() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Agent call history cannot be removed'; END IF;
  IF OLD.state <> 'pending' OR NEW.id <> OLD.id OR NEW.org_id <> OLD.org_id
     OR NEW.call_id <> OLD.call_id OR NEW.work_id <> OLD.work_id OR NEW.step_run_id <> OLD.step_run_id
     OR NEW.attempt <> OLD.attempt OR NEW.request_hash <> OLD.request_hash OR NEW.deadline <> OLD.deadline
     OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
     OR NEW.record->'call' IS DISTINCT FROM OLD.record->'call'
     OR NEW.record->'outputObjectId' IS DISTINCT FROM OLD.record->'outputObjectId'
     OR NEW.record->'stepVersion' IS DISTINCT FROM OLD.record->'stepVersion'
     OR NEW.record->'implementationVersion' IS DISTINCT FROM OLD.record->'implementationVersion'
     OR NEW.record->'implementationMode' IS DISTINCT FROM OLD.record->'implementationMode'
     OR NEW.record->'deadlineAt' IS DISTINCT FROM OLD.record->'deadlineAt' THEN
    RAISE EXCEPTION 'Agent attempt identity or terminal result is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER agent_call_no_rewrite BEFORE UPDATE OR DELETE ON orchestration.agent_call FOR EACH ROW EXECUTE FUNCTION orchestration.guard_agent_call();
--> statement-breakpoint
CREATE TRIGGER agent_call_no_truncate BEFORE TRUNCATE ON orchestration.agent_call FOR EACH STATEMENT EXECUTE FUNCTION orchestration.guard_agent_call();
