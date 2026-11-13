import { idCheck } from '@fasrun/backend-defaults';
import { sql } from 'drizzle-orm';
import {
  pgSchema,
  text,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
export const orchestrationSchema = pgSchema('orchestration');
const standard = () => ({
  id: text('id').notNull(),
  orgId: text('org_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
  version: integer('version').notNull().default(1),
});
export const dataObject = orchestrationSchema
  .table(
    'data_object',
    {
      ...standard(),
      objectId: text('object_id').notNull(),
      category: text('category').notNull(),
      versionHash: text('version_hash').notNull(),
      contentHash: text('content_hash').notNull(),
      byteLength: integer('byte_length').notNull(),
      object: jsonb('object').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_data_object', columns: [t.id] }),
      check('ck_data_object_id', idCheck(t.id, 'dat')),
      check('ck_data_object_org', idCheck(t.orgId, 'org')),
      check('ck_data_object_object_id', idCheck(t.objectId, 'obj')),
      check('ck_data_object_version', sql`${t.version} > 0`),
      check('ck_data_object_length', sql`${t.byteLength} >= 0`),
      check('ck_data_object_hash', sql`${t.contentHash} ~ '^[a-f0-9]{64}$' AND ${t.versionHash} ~ '^[a-f0-9]{64}$'`),
      uniqueIndex('ix_data_object_org_identity').on(t.orgId, t.category, t.objectId, t.versionHash),
      index('ix_data_object_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('data_object_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const outbox = orchestrationSchema
  .table(
    'outbox',
    {
      ...standard(),
      eventId: text('event_id').notNull(),
      event: jsonb('event').notNull(),
      state: text('state').notNull().default('pending'),
      leaseToken: text('lease_token'),
      leaseUntil: timestamp('lease_until', { withTimezone: true }),
      retryAt: timestamp('retry_at', { withTimezone: true }).notNull().defaultNow(),
      attempts: integer('attempts').notNull().default(0),
    },
    (t) => [
      primaryKey({ name: 'pk_outbox', columns: [t.id] }),
      check('ck_outbox_id', idCheck(t.id, 'evt')),
      check('ck_outbox_org', idCheck(t.orgId, 'org')),
      check('ck_outbox_version', sql`${t.version} > 0`),
      uniqueIndex('ix_outbox_org_event').on(t.orgId, t.eventId),
      check('ck_outbox_state', sql`${t.state} in ('pending','leased','delivered')`),
      index('ix_outbox_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('outbox_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
