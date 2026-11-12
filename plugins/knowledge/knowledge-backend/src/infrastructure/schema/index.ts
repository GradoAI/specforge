import { idCheck } from '@fasrun/backend-defaults';
import { sql } from 'drizzle-orm';
import {
  pgSchema,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  primaryKey,
  uniqueIndex,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
export const knowledgeSchema = pgSchema('knowledge');
const standard = () => ({
  id: text('id').notNull(),
  orgId: text('org_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
  version: integer('version').notNull().default(1),
});
export const projectConfigCache = knowledgeSchema
  .table(
    'project_config_cache',
    {
      ...standard(),
      repositoryId: text('repository_id').notNull(),
      baseCommit: text('base_commit').notNull(),
      snapshot: jsonb('snapshot').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_project_config_cache', columns: [t.id] }),
      check('ck_project_config_cache_id', idCheck(t.id, 'cfg')),
      check('ck_project_config_cache_org', idCheck(t.orgId, 'org')),
      check('ck_project_config_cache_version', sql`${t.version} > 0`),
      uniqueIndex('ix_project_config_cache_org_identity').on(t.orgId, t.repositoryId, t.baseCommit),
      pgPolicy('project_config_cache_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const workflowDefinition = knowledgeSchema
  .table(
    'workflow_definition',
    {
      ...standard(),
      definitionKey: text('definition_key').notNull(),
      definitionVersion: text('definition_version').notNull(),
      snapshot: jsonb('snapshot').notNull(),
      isCustomized: boolean('is_customized').notNull().default(false),
    },
    (t) => [
      primaryKey({ name: 'pk_workflow_definition', columns: [t.id] }),
      check('ck_workflow_definition_id', idCheck(t.id, 'wfd')),
      check('ck_workflow_definition_org', idCheck(t.orgId, 'org')),
      check('ck_workflow_definition_version', sql`${t.version} > 0`),
      uniqueIndex('ix_workflow_definition_org_identity').on(t.orgId, t.definitionKey, t.definitionVersion),
      pgPolicy('workflow_definition_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const specTemplate = knowledgeSchema
  .table(
    'spec_template',
    {
      ...standard(),
      definitionKey: text('definition_key').notNull(),
      definitionVersion: text('definition_version').notNull(),
      snapshot: jsonb('snapshot').notNull(),
      isCustomized: boolean('is_customized').notNull().default(false),
    },
    (t) => [
      primaryKey({ name: 'pk_spec_template', columns: [t.id] }),
      check('ck_spec_template_id', idCheck(t.id, 'spt')),
      check('ck_spec_template_org', idCheck(t.orgId, 'org')),
      check('ck_spec_template_version', sql`${t.version} > 0`),
      uniqueIndex('ix_spec_template_org_identity').on(t.orgId, t.definitionKey, t.definitionVersion),
      pgPolicy('spec_template_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const organizationRule = knowledgeSchema
  .table(
    'organization_rule',
    {
      ...standard(),
      definitionKey: text('definition_key').notNull(),
      definitionVersion: text('definition_version').notNull(),
      snapshot: jsonb('snapshot').notNull(),
      isCustomized: boolean('is_customized').notNull().default(false),
    },
    (t) => [
      primaryKey({ name: 'pk_organization_rule', columns: [t.id] }),
      check('ck_organization_rule_id', idCheck(t.id, 'orl')),
      check('ck_organization_rule_org', idCheck(t.orgId, 'org')),
      check('ck_organization_rule_version', sql`${t.version} > 0`),
      uniqueIndex('ix_organization_rule_org_identity').on(t.orgId, t.definitionKey, t.definitionVersion),
      pgPolicy('organization_rule_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
