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
export const environmentSchema = pgSchema('environment');
const standard = () => ({
  id: text('id').notNull(),
  orgId: text('org_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
  version: integer('version').notNull().default(1),
});
export const templateVersion = environmentSchema
  .table(
    'template_version',
    {
      ...standard(),
      definitionKey: text('definition_key').notNull(),
      definitionVersion: text('definition_version').notNull(),
      snapshot: jsonb('snapshot').notNull(),
      isCustomized: boolean('is_customized').notNull().default(false),
    },
    (t) => [
      primaryKey({ name: 'pk_template_version', columns: [t.id] }),
      check('ck_template_version_id', idCheck(t.id, 'env')),
      check('ck_template_version_org', idCheck(t.orgId, 'org')),
      check('ck_template_version_version', sql`${t.version} > 0`),
      uniqueIndex('ix_template_version_org_identity').on(t.orgId, t.definitionKey, t.definitionVersion),
      pgPolicy('template_version_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
