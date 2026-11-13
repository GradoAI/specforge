ALTER TABLE connect.consumer_receipt FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.consumer_receipt IS 'Tenant-isolated connect consumer_receipt records';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.event_id IS 'Connect event_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.consumer_receipt.consumer IS 'Connect consumer';
--> statement-breakpoint
ALTER TABLE connect.credential_envelope FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.credential_envelope IS 'Tenant-isolated connect credential_envelope records';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.integration_id IS 'Connect integration_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.credential_version IS 'Connect credential_version';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.envelope IS 'Connect envelope';
--> statement-breakpoint
COMMENT ON COLUMN connect.credential_envelope.active IS 'Connect active';
--> statement-breakpoint
ALTER TABLE connect.discussion FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.discussion IS 'Tenant-isolated connect discussion records';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.integration_id IS 'Connect integration_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.external_id IS 'Connect external_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.discussion.repository_id IS 'Connect repository_id';
--> statement-breakpoint
ALTER TABLE connect.external_object FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.external_object IS 'Tenant-isolated connect external_object records';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.integration_id IS 'Connect integration_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.repository_id IS 'Connect repository_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.external_id IS 'Connect external_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.kind IS 'Connect kind';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.observed_at IS 'Connect observed_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.external_object.digest IS 'Connect digest';
--> statement-breakpoint
ALTER TABLE connect.inbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.inbox IS 'Tenant-isolated connect inbox records';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.installation_id IS 'Connect installation_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.delivery_id IS 'Connect delivery_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.repository_id IS 'Connect repository_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.event IS 'Connect event';
--> statement-breakpoint
COMMENT ON COLUMN connect.inbox.receipt IS 'Connect receipt';
--> statement-breakpoint
ALTER TABLE connect.integration FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.integration IS 'Tenant-isolated connect integration records';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.installation_id IS 'Connect installation_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.provider IS 'Connect provider';
--> statement-breakpoint
COMMENT ON COLUMN connect.integration.active IS 'Connect active';
--> statement-breakpoint
ALTER TABLE connect.outbound_action FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.outbound_action IS 'Tenant-isolated connect outbound_action records';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.integration_id IS 'Connect integration_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.action_key IS 'Connect action_key';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.request_hash IS 'Connect request_hash';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.target IS 'Connect target';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.state IS 'Connect state';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.lease_token IS 'Connect lease_token';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.lease_until IS 'Connect lease_until';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.retry_at IS 'Connect retry_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbound_action.result IS 'Connect result';
--> statement-breakpoint
ALTER TABLE connect.outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.outbox IS 'Tenant-isolated connect outbox records';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.event_id IS 'Connect event_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.event IS 'Connect event';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.lease_token IS 'Connect lease_token';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.lease_until IS 'Connect lease_until';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.retry_at IS 'Connect retry_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.outbox.delivered_at IS 'Connect delivered_at';
--> statement-breakpoint
ALTER TABLE connect.reconcile_cursor FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.reconcile_cursor IS 'Tenant-isolated connect reconcile_cursor records';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.integration_id IS 'Connect integration_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.repository_id IS 'Connect repository_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.cursor IS 'Connect cursor';
--> statement-breakpoint
COMMENT ON COLUMN connect.reconcile_cursor.high_watermark IS 'Connect high_watermark';
--> statement-breakpoint
ALTER TABLE connect.repository_binding FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE connect.repository_binding IS 'Tenant-isolated connect repository_binding records';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.id IS 'Connect id';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.org_id IS 'Connect org_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.created_at IS 'Connect created_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.updated_at IS 'Connect updated_at';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.created_by IS 'Connect created_by';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.version IS 'Connect version';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.integration_id IS 'Connect integration_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.repository_id IS 'Connect repository_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.team_id IS 'Connect team_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.project_id IS 'Connect project_id';
--> statement-breakpoint
COMMENT ON COLUMN connect.repository_binding.active IS 'Connect active';
--> statement-breakpoint
CREATE FUNCTION connect.reject_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable connect record'; END $$;
--> statement-breakpoint
CREATE TRIGGER inbox_immutable BEFORE UPDATE OR DELETE ON connect.inbox FOR EACH ROW EXECUTE FUNCTION connect.reject_record_mutation();
--> statement-breakpoint
CREATE TRIGGER consumer_receipt_immutable BEFORE UPDATE OR DELETE ON connect.consumer_receipt FOR EACH ROW EXECUTE FUNCTION connect.reject_record_mutation();
