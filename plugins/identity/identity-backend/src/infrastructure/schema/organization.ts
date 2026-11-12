import { idCheck } from '@fasrun/backend-defaults';
import { sql } from 'drizzle-orm';
import { check, index, integer, pgPolicy, pgSchema, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const identitySchema = pgSchema('identity');
export const organization = identitySchema
  .table(
    'organization',
    {
      id: text('id').notNull(),
      orgId: text('org_id').notNull(),
      name: text('name').notNull(),
      slug: text('slug').notNull(),
      deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      createdBy: text('created_by').notNull(),
      version: integer('version').notNull().default(1),
    },
    (table) => [
      primaryKey({ name: 'pk_organization', columns: [table.id] }),
      check('ck_organization_id', idCheck(table.id, 'org')),
      check('ck_organization_org_id_self', sql`${table.orgId} = ${table.id}`),
      check('ck_organization_name_length', sql`char_length(${table.name}) between 1 and 200`),
      unique('uq_organization_slug').on(table.slug),
      index('ix_organization_org_created_id').on(table.orgId, table.createdAt, table.id),
      pgPolicy('organization_org_isolation', {
        using: sql`${table.orgId} = current_setting('fasrun.org_id', true)`,
        withCheck: sql`${table.orgId} = current_setting('fasrun.org_id', true)`,
      }),
    ],
  )
  .enableRLS();
