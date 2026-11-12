ALTER TABLE governance.audit_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE governance.audit_event IS '治理插件租户隔离的 audit_event 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.id IS '行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.org_id IS 'org_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.created_at IS '不可变创建时间，UTC 时刻';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.updated_at IS '最近更新时间；只追加表保持创建时间';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.created_by IS '经认证的写入主体标识';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.version IS '行版本；可变发件箱每次变更递增';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.event_id IS 'event_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.sequence IS '组织内审计链连续递增序号';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.previous_hash IS '前序审计记录 SHA-256；首记录为64位零';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.hash IS '规范 JSON 与前序摘要组合的 SHA-256';
--> statement-breakpoint
COMMENT ON COLUMN governance.audit_event.event IS '已遮蔽的版本化事件 JSON';
--> statement-breakpoint
ALTER TABLE governance.budget_constraint FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE governance.budget_constraint IS '治理插件租户隔离的 budget_constraint 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.id IS '行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.org_id IS 'org_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.created_at IS '不可变创建时间，UTC 时刻';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.updated_at IS '最近更新时间；只追加表保持创建时间';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.created_by IS '经认证的写入主体标识';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.version IS '行版本；可变发件箱每次变更递增';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.policy_id IS 'policy_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.scope IS '预算约束层级：organization/team/project/member';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.scope_id IS 'scope_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.budget_constraint.snapshot IS '不可变策略或预算约束快照';
--> statement-breakpoint
ALTER TABLE governance.chain_checkpoint FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE governance.chain_checkpoint IS '治理插件租户隔离的 chain_checkpoint 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.id IS '行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.org_id IS 'org_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.created_at IS '不可变创建时间，UTC 时刻';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.updated_at IS '最近更新时间；只追加表保持创建时间';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.created_by IS '经认证的写入主体标识';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.version IS '行版本；可变发件箱每次变更递增';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.sequence IS '组织内审计链连续递增序号';
--> statement-breakpoint
COMMENT ON COLUMN governance.chain_checkpoint.hash IS '规范 JSON 与前序摘要组合的 SHA-256';
--> statement-breakpoint
ALTER TABLE governance.consumer_receipt FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE governance.consumer_receipt IS '治理插件租户隔离的 consumer_receipt 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN governance.consumer_receipt.id IS '行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.consumer_receipt.org_id IS 'org_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.consumer_receipt.created_at IS '不可变创建时间，UTC 时刻';
--> statement-breakpoint
COMMENT ON COLUMN governance.consumer_receipt.updated_at IS '最近更新时间；只追加表保持创建时间';
--> statement-breakpoint
COMMENT ON COLUMN governance.consumer_receipt.created_by IS '经认证的写入主体标识';
--> statement-breakpoint
COMMENT ON COLUMN governance.consumer_receipt.version IS '行版本；可变发件箱每次变更递增';
--> statement-breakpoint
COMMENT ON COLUMN governance.consumer_receipt.event_id IS 'event_行标识：表专用前缀加 ULID';
--> statement-breakpoint
ALTER TABLE governance.outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE governance.outbox IS '治理插件租户隔离的 outbox 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.id IS '行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.org_id IS 'org_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.created_at IS '不可变创建时间，UTC 时刻';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.updated_at IS '最近更新时间；只追加表保持创建时间';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.created_by IS '经认证的写入主体标识';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.version IS '行版本；可变发件箱每次变更递增';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.event_id IS 'event_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.event IS '已遮蔽的版本化事件 JSON';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.state IS '发件箱状态 pending/leased/delivered';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.lease_token IS '本次租约不可预测令牌；确认必须匹配';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.lease_until IS '租约 UTC 到期时刻；到期可重新领取';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.retry_at IS '下次允许领取的 UTC 时刻';
--> statement-breakpoint
COMMENT ON COLUMN governance.outbox.attempts IS '已领取次数，首次领取记为1';
--> statement-breakpoint
ALTER TABLE governance.policy_version FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE governance.policy_version IS '治理插件租户隔离的 policy_version 持久记录';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.id IS '行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.org_id IS 'org_行标识：表专用前缀加 ULID';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.created_at IS '不可变创建时间，UTC 时刻';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.updated_at IS '最近更新时间；只追加表保持创建时间';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.created_by IS '经认证的写入主体标识';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.version IS '行版本；可变发件箱每次变更递增';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.policy_version IS 'policy_行版本；可变发件箱每次变更递增';
--> statement-breakpoint
COMMENT ON COLUMN governance.policy_version.snapshot IS '不可变策略或预算约束快照';
--> statement-breakpoint
CREATE FUNCTION governance.reject_append_only_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only governance record' USING ERRCODE = '55000'; END $$;
--> statement-breakpoint
CREATE TRIGGER policy_version_append_only BEFORE UPDATE OR DELETE ON governance.policy_version FOR EACH ROW EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER policy_version_no_truncate BEFORE TRUNCATE ON governance.policy_version FOR EACH STATEMENT EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER budget_constraint_append_only BEFORE UPDATE OR DELETE ON governance.budget_constraint FOR EACH ROW EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER budget_constraint_no_truncate BEFORE TRUNCATE ON governance.budget_constraint FOR EACH STATEMENT EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON governance.audit_event FOR EACH ROW EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON governance.audit_event FOR EACH STATEMENT EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER chain_checkpoint_append_only BEFORE UPDATE OR DELETE ON governance.chain_checkpoint FOR EACH ROW EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER chain_checkpoint_no_truncate BEFORE TRUNCATE ON governance.chain_checkpoint FOR EACH STATEMENT EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER consumer_receipt_append_only BEFORE UPDATE OR DELETE ON governance.consumer_receipt FOR EACH ROW EXECUTE FUNCTION governance.reject_append_only_change();
--> statement-breakpoint
CREATE TRIGGER consumer_receipt_no_truncate BEFORE TRUNCATE ON governance.consumer_receipt FOR EACH STATEMENT EXECUTE FUNCTION governance.reject_append_only_change();
