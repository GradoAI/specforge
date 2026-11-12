ALTER TABLE environment.template_version FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON TABLE environment.template_version IS 'Versioned tenant-isolated environment.template_version records';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.id IS 'Owner-managed id';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.org_id IS 'Owner-managed org_id';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.created_at IS 'Owner-managed created_at';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.updated_at IS 'Owner-managed updated_at';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.created_by IS 'Owner-managed created_by';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.version IS 'Owner-managed version';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.definition_key IS 'Owner-managed definition_key';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.definition_version IS 'Owner-managed definition_version';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.snapshot IS 'Owner-managed snapshot';
--> statement-breakpoint
COMMENT ON COLUMN environment.template_version.is_customized IS 'Owner-managed is_customized';

--> statement-breakpoint
CREATE FUNCTION environment.reject_definition_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF; RAISE EXCEPTION 'Catalog versions are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER template_version_immutable BEFORE UPDATE OR DELETE ON environment.template_version FOR EACH ROW EXECUTE FUNCTION environment.reject_definition_change();
--> statement-breakpoint
CREATE TRIGGER template_version_no_truncate BEFORE TRUNCATE ON environment.template_version FOR EACH STATEMENT EXECUTE FUNCTION environment.reject_definition_change();
