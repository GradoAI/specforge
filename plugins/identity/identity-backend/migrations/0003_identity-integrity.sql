ALTER TABLE identity.association_issue FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.association_issue IS 'identity 租户隔离的 association_issue 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.provider IS 'provider 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.issuer IS 'issuer 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.subject IS 'subject 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.event_id IS 'event_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.association_issue.state IS 'state 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.authorization_record FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.authorization_record IS 'identity 租户隔离的 authorization_record 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.intake_id IS 'intake_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.snapshot IS 'snapshot 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_record.permissions IS 'permissions 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.authorization_revocation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.authorization_revocation IS 'identity 租户隔离的 authorization_revocation 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.authorization_id IS 'authorization_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.reason IS 'reason 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.authorization_revocation.idempotency_key IS 'idempotency_key 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.candidate FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.candidate IS 'identity 租户隔离的 candidate 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.intake_id IS 'intake_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.candidate.evidence IS 'evidence 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.external_account FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.external_account IS 'identity 租户隔离的 external_account 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.provider IS 'provider 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.issuer IS 'issuer 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.subject IS 'subject 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.external_account.member_id IS 'member_id 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.login_challenge FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.login_challenge IS 'identity 租户隔离的 login_challenge 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.state_digest IS 'state_digest 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.browser_digest IS 'browser_digest 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.verifier IS '一次性 PKCE 验证器，交换后删除；禁止日志输出';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.nonce IS 'nonce 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.login_challenge.expires_at IS 'expires_at 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.member FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.member IS 'identity 租户隔离的 member 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.issuer IS 'issuer 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.subject IS 'subject 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.active IS 'active 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.session_version IS 'session_version 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.member.profile IS 'profile 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.outbox IS 'identity 租户隔离的 outbox 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.event_id IS 'event_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.event IS 'event 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.state IS 'state 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.lease_token IS 'lease_token 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.lease_until IS 'lease_until 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.retry_at IS 'retry_at 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.outbox.attempts IS 'attempts 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.permission_rule FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.permission_rule IS 'identity 租户隔离的 permission_rule 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.rule_key IS 'rule_key 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.definition IS 'definition 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.permission_rule.is_customized IS 'is_customized 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.project_scope FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.project_scope IS 'identity 租户隔离的 project_scope 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.member_id IS 'member_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.project_scope.scope IS 'scope 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.role_assignment FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.role_assignment IS 'identity 租户隔离的 role_assignment 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.member_id IS 'member_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.role IS 'role 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.role_assignment.scope IS 'scope 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.session FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.session IS 'identity 租户隔离的 session 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.digest IS '会话随机令牌 SHA256，绝不存原令牌';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.member_id IS 'member_id 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.session_version IS 'session_version 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.csrf_digest IS 'CSRF 随机值 SHA256';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.expires_at IS 'expires_at 身份领域属性';
--> statement-breakpoint
COMMENT ON COLUMN identity.session.revoked IS 'revoked 身份领域属性';
--> statement-breakpoint
ALTER TABLE identity.team FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE identity.team IS 'identity 租户隔离的 team 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN identity.team.id IS '行标识：表专用前缀 ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.team.org_id IS '所属组织 org_ ULID';
--> statement-breakpoint
COMMENT ON COLUMN identity.team.created_at IS '不可变创建时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.team.updated_at IS '最近变更时间';
--> statement-breakpoint
COMMENT ON COLUMN identity.team.created_by IS '经认证写入主体';
--> statement-breakpoint
COMMENT ON COLUMN identity.team.version IS '乐观版本号';
--> statement-breakpoint
COMMENT ON COLUMN identity.team.name IS 'name 身份领域属性';
--> statement-breakpoint
CREATE FUNCTION identity.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'identity immutable record' USING ERRCODE='55000'; END; $$;
--> statement-breakpoint
CREATE TRIGGER authorization_record_immutable BEFORE UPDATE OR DELETE ON identity.authorization_record FOR EACH ROW EXECUTE FUNCTION identity.reject_immutable_change();
--> statement-breakpoint
CREATE TRIGGER authorization_record_no_truncate BEFORE TRUNCATE ON identity.authorization_record FOR EACH STATEMENT EXECUTE FUNCTION identity.reject_immutable_change();
--> statement-breakpoint
CREATE TRIGGER authorization_revocation_immutable BEFORE UPDATE OR DELETE ON identity.authorization_revocation FOR EACH ROW EXECUTE FUNCTION identity.reject_immutable_change();
--> statement-breakpoint
CREATE TRIGGER authorization_revocation_no_truncate BEFORE TRUNCATE ON identity.authorization_revocation FOR EACH STATEMENT EXECUTE FUNCTION identity.reject_immutable_change();
