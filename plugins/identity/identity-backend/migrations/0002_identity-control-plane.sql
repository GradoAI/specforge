CREATE TABLE "identity"."association_issue" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"event_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "pk_association_issue" PRIMARY KEY("id"),
	CONSTRAINT "ck_association_issue_id" CHECK ("identity"."association_issue"."id" ~ '^iss_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_association_issue_org" CHECK ("identity"."association_issue"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_association_issue_version" CHECK ("identity"."association_issue"."version">0),
	CONSTRAINT "ck_association_issue_state" CHECK ("identity"."association_issue"."state" in ('pending','resolved'))
);
--> statement-breakpoint
ALTER TABLE "identity"."association_issue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."authorization_record" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"intake_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"permissions" jsonb NOT NULL,
	CONSTRAINT "pk_authorization_record" PRIMARY KEY("id"),
	CONSTRAINT "ck_authorization_record_id" CHECK ("identity"."authorization_record"."id" ~ '^aut_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_authorization_record_org" CHECK ("identity"."authorization_record"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_authorization_record_version" CHECK ("identity"."authorization_record"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."authorization_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."authorization_revocation" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"authorization_id" text NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "pk_authorization_revocation" PRIMARY KEY("id"),
	CONSTRAINT "ck_authorization_revocation_id" CHECK ("identity"."authorization_revocation"."id" ~ '^rev_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_authorization_revocation_org" CHECK ("identity"."authorization_revocation"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_authorization_revocation_version" CHECK ("identity"."authorization_revocation"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."authorization_revocation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."candidate" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"intake_id" text NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "pk_candidate" PRIMARY KEY("id"),
	CONSTRAINT "ck_candidate_id" CHECK ("identity"."candidate"."id" ~ '^can_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_candidate_org" CHECK ("identity"."candidate"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_candidate_version" CHECK ("identity"."candidate"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."candidate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."external_account" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"member_id" text NOT NULL,
	CONSTRAINT "pk_external_account" PRIMARY KEY("id"),
	CONSTRAINT "ck_external_account_id" CHECK ("identity"."external_account"."id" ~ '^ext_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_external_account_org" CHECK ("identity"."external_account"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_external_account_version" CHECK ("identity"."external_account"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."external_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."login_challenge" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state_digest" text NOT NULL,
	"browser_digest" text NOT NULL,
	"verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pk_login_challenge" PRIMARY KEY("id"),
	CONSTRAINT "ck_login_challenge_id" CHECK ("identity"."login_challenge"."id" ~ '^log_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_login_challenge_org" CHECK ("identity"."login_challenge"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_login_challenge_version" CHECK ("identity"."login_challenge"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."login_challenge" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."member" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"profile" jsonb NOT NULL,
	CONSTRAINT "pk_member" PRIMARY KEY("id"),
	CONSTRAINT "ck_member_id" CHECK ("identity"."member"."id" ~ '^mem_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_member_org" CHECK ("identity"."member"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_member_version" CHECK ("identity"."member"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."outbox" (
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
	CONSTRAINT "ck_outbox_id" CHECK ("identity"."outbox"."id" ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_org" CHECK ("identity"."outbox"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_outbox_version" CHECK ("identity"."outbox"."version">0),
	CONSTRAINT "ck_outbox_state" CHECK ("identity"."outbox"."state" in ('pending','leased','delivered'))
);
--> statement-breakpoint
ALTER TABLE "identity"."outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."permission_rule" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rule_key" text NOT NULL,
	"definition" jsonb NOT NULL,
	"is_customized" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pk_permission_rule" PRIMARY KEY("id"),
	CONSTRAINT "ck_permission_rule_id" CHECK ("identity"."permission_rule"."id" ~ '^rul_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_permission_rule_org" CHECK ("identity"."permission_rule"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_permission_rule_version" CHECK ("identity"."permission_rule"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."permission_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."project_scope" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"member_id" text NOT NULL,
	"scope" jsonb NOT NULL,
	CONSTRAINT "pk_project_scope" PRIMARY KEY("id"),
	CONSTRAINT "ck_project_scope_id" CHECK ("identity"."project_scope"."id" ~ '^prj_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_project_scope_org" CHECK ("identity"."project_scope"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_project_scope_version" CHECK ("identity"."project_scope"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."project_scope" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."role_assignment" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"member_id" text NOT NULL,
	"role" text NOT NULL,
	"scope" jsonb NOT NULL,
	CONSTRAINT "pk_role_assignment" PRIMARY KEY("id"),
	CONSTRAINT "ck_role_assignment_id" CHECK ("identity"."role_assignment"."id" ~ '^rol_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_role_assignment_org" CHECK ("identity"."role_assignment"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_role_assignment_version" CHECK ("identity"."role_assignment"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."role_assignment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."session" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"digest" text NOT NULL,
	"member_id" text NOT NULL,
	"session_version" integer NOT NULL,
	"csrf_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pk_session" PRIMARY KEY("id"),
	CONSTRAINT "ck_session_id" CHECK ("identity"."session"."id" ~ '^ses_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_session_org" CHECK ("identity"."session"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_session_version" CHECK ("identity"."session"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."team" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "pk_team" PRIMARY KEY("id"),
	CONSTRAINT "ck_team_id" CHECK ("identity"."team"."id" ~ '^tem_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_team_org" CHECK ("identity"."team"."org_id" ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'),
	CONSTRAINT "ck_team_version" CHECK ("identity"."team"."version">0)
);
--> statement-breakpoint
ALTER TABLE "identity"."team" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ix_association_issue_org_created_id" ON "identity"."association_issue" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_association_issue_identity" ON "identity"."association_issue" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "ix_authorization_record_org_created_id" ON "identity"."authorization_record" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_authorization_record_identity" ON "identity"."authorization_record" USING btree ("org_id","intake_id");--> statement-breakpoint
CREATE INDEX "ix_authorization_revocation_org_created_id" ON "identity"."authorization_revocation" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_authorization_revocation_identity" ON "identity"."authorization_revocation" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ix_candidate_org_created_id" ON "identity"."candidate" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_candidate_identity" ON "identity"."candidate" USING btree ("org_id","intake_id");--> statement-breakpoint
CREATE INDEX "ix_external_account_org_created_id" ON "identity"."external_account" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_external_account_identity" ON "identity"."external_account" USING btree ("org_id","provider","issuer","subject");--> statement-breakpoint
CREATE INDEX "ix_login_challenge_org_created_id" ON "identity"."login_challenge" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_login_challenge_identity" ON "identity"."login_challenge" USING btree ("org_id","state_digest");--> statement-breakpoint
CREATE INDEX "ix_member_org_created_id" ON "identity"."member" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_member_identity" ON "identity"."member" USING btree ("org_id","issuer","subject");--> statement-breakpoint
CREATE INDEX "ix_outbox_org_created_id" ON "identity"."outbox" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_outbox_identity" ON "identity"."outbox" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE INDEX "ix_permission_rule_org_created_id" ON "identity"."permission_rule" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_permission_rule_identity" ON "identity"."permission_rule" USING btree ("org_id","rule_key");--> statement-breakpoint
CREATE INDEX "ix_project_scope_org_created_id" ON "identity"."project_scope" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ix_role_assignment_org_created_id" ON "identity"."role_assignment" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "ix_session_org_created_id" ON "identity"."session" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ix_session_identity" ON "identity"."session" USING btree ("org_id","digest");--> statement-breakpoint
CREATE INDEX "ix_team_org_created_id" ON "identity"."team" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE POLICY "association_issue_org_isolation" ON "identity"."association_issue" AS PERMISSIVE FOR ALL TO public USING ("identity"."association_issue"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."association_issue"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "authorization_record_org_isolation" ON "identity"."authorization_record" AS PERMISSIVE FOR ALL TO public USING ("identity"."authorization_record"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."authorization_record"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "authorization_revocation_org_isolation" ON "identity"."authorization_revocation" AS PERMISSIVE FOR ALL TO public USING ("identity"."authorization_revocation"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."authorization_revocation"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "candidate_org_isolation" ON "identity"."candidate" AS PERMISSIVE FOR ALL TO public USING ("identity"."candidate"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."candidate"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "external_account_org_isolation" ON "identity"."external_account" AS PERMISSIVE FOR ALL TO public USING ("identity"."external_account"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."external_account"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "login_challenge_org_isolation" ON "identity"."login_challenge" AS PERMISSIVE FOR ALL TO public USING ("identity"."login_challenge"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."login_challenge"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "member_org_isolation" ON "identity"."member" AS PERMISSIVE FOR ALL TO public USING ("identity"."member"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."member"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "outbox_org_isolation" ON "identity"."outbox" AS PERMISSIVE FOR ALL TO public USING ("identity"."outbox"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."outbox"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "permission_rule_org_isolation" ON "identity"."permission_rule" AS PERMISSIVE FOR ALL TO public USING ("identity"."permission_rule"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."permission_rule"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "project_scope_org_isolation" ON "identity"."project_scope" AS PERMISSIVE FOR ALL TO public USING ("identity"."project_scope"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."project_scope"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "role_assignment_org_isolation" ON "identity"."role_assignment" AS PERMISSIVE FOR ALL TO public USING ("identity"."role_assignment"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."role_assignment"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "session_org_isolation" ON "identity"."session" AS PERMISSIVE FOR ALL TO public USING ("identity"."session"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."session"."org_id"=current_setting('fasrun.org_id',true));--> statement-breakpoint
CREATE POLICY "team_org_isolation" ON "identity"."team" AS PERMISSIVE FOR ALL TO public USING ("identity"."team"."org_id"=current_setting('fasrun.org_id',true)) WITH CHECK ("identity"."team"."org_id"=current_setting('fasrun.org_id',true));
--> statement-breakpoint
ALTER TABLE "identity"."role_assignment" ADD CONSTRAINT "ck_role_assignment_role" CHECK ("role" in ('platform_admin','platform_auditor','organization_admin','budget_admin','security_admin','environment_admin','operations','team_lead','member','observer','requirements_reviewer','design_reviewer','merge_approver','machine_owner'));
