ALTER TABLE knowledge.organization_rule FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE knowledge.organization_rule IS 'Versioned tenant-isolated knowledge.organization_rule records';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.id IS 'Owner-managed id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.org_id IS 'Owner-managed org_id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.created_at IS 'Owner-managed created_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.updated_at IS 'Owner-managed updated_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.created_by IS 'Owner-managed created_by';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.version IS 'Owner-managed version';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.definition_key IS 'Owner-managed definition_key';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.definition_version IS 'Owner-managed definition_version';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.snapshot IS 'Owner-managed snapshot';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.organization_rule.is_customized IS 'Owner-managed is_customized';
--> statement-breakpoint
ALTER TABLE knowledge.project_config_cache FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE knowledge.project_config_cache IS 'Versioned tenant-isolated knowledge.project_config_cache records';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.id IS 'Owner-managed id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.org_id IS 'Owner-managed org_id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.created_at IS 'Owner-managed created_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.updated_at IS 'Owner-managed updated_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.created_by IS 'Owner-managed created_by';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.version IS 'Owner-managed version';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.repository_id IS 'Owner-managed repository_id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.base_commit IS 'Owner-managed base_commit';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.project_config_cache.snapshot IS 'Owner-managed snapshot';
--> statement-breakpoint
ALTER TABLE knowledge.spec_template FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE knowledge.spec_template IS 'Versioned tenant-isolated knowledge.spec_template records';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.id IS 'Owner-managed id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.org_id IS 'Owner-managed org_id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.created_at IS 'Owner-managed created_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.updated_at IS 'Owner-managed updated_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.created_by IS 'Owner-managed created_by';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.version IS 'Owner-managed version';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.definition_key IS 'Owner-managed definition_key';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.definition_version IS 'Owner-managed definition_version';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.snapshot IS 'Owner-managed snapshot';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.spec_template.is_customized IS 'Owner-managed is_customized';
--> statement-breakpoint
ALTER TABLE knowledge.workflow_definition FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE knowledge.workflow_definition IS 'Versioned tenant-isolated knowledge.workflow_definition records';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.id IS 'Owner-managed id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.org_id IS 'Owner-managed org_id';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.created_at IS 'Owner-managed created_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.updated_at IS 'Owner-managed updated_at';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.created_by IS 'Owner-managed created_by';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.version IS 'Owner-managed version';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.definition_key IS 'Owner-managed definition_key';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.definition_version IS 'Owner-managed definition_version';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.snapshot IS 'Owner-managed snapshot';
--> statement-breakpoint
COMMENT ON COLUMN knowledge.workflow_definition.is_customized IS 'Owner-managed is_customized';
--> statement-breakpoint
CREATE FUNCTION knowledge.reject_cache_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable project configuration capture'; END $$;
--> statement-breakpoint
CREATE TRIGGER project_cache_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON knowledge.project_config_cache FOR EACH STATEMENT EXECUTE FUNCTION knowledge.reject_cache_change();

--> statement-breakpoint
CREATE FUNCTION knowledge.reject_definition_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF; RAISE EXCEPTION 'Catalog versions are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER organization_rule_immutable BEFORE UPDATE OR DELETE ON knowledge.organization_rule FOR EACH ROW EXECUTE FUNCTION knowledge.reject_definition_change();
--> statement-breakpoint
CREATE TRIGGER organization_rule_no_truncate BEFORE TRUNCATE ON knowledge.organization_rule FOR EACH STATEMENT EXECUTE FUNCTION knowledge.reject_definition_change();
--> statement-breakpoint
CREATE TRIGGER workflow_definition_immutable BEFORE UPDATE OR DELETE ON knowledge.workflow_definition FOR EACH ROW EXECUTE FUNCTION knowledge.reject_definition_change();
--> statement-breakpoint
CREATE TRIGGER workflow_definition_no_truncate BEFORE TRUNCATE ON knowledge.workflow_definition FOR EACH STATEMENT EXECUTE FUNCTION knowledge.reject_definition_change();
--> statement-breakpoint
CREATE TRIGGER spec_template_immutable BEFORE UPDATE OR DELETE ON knowledge.spec_template FOR EACH ROW EXECUTE FUNCTION knowledge.reject_definition_change();
--> statement-breakpoint
CREATE TRIGGER spec_template_no_truncate BEFORE TRUNCATE ON knowledge.spec_template FOR EACH STATEMENT EXECUTE FUNCTION knowledge.reject_definition_change();
