import { idCheck } from '@fasrun/backend-defaults';
import { sql } from 'drizzle-orm';
import {
  pgSchema,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
export const governanceSchema = pgSchema('governance');
const standard = () => ({
  id: text('id').notNull(),
  orgId: text('org_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
  version: integer('version').notNull().default(1),
});
export const policyVersion = governanceSchema
  .table(
    'policy_version',
    { ...standard(), policyVersion: text('policy_version').notNull(), snapshot: jsonb('snapshot').notNull() },
    (t) => [
      primaryKey({ name: 'pk_policy_version', columns: [t.id] }),
      check('ck_policy_version_id', idCheck(t.id, 'pol')),
      check('ck_policy_version_org', idCheck(t.orgId, 'org')),
      check('ck_policy_version_version', sql`${t.version} > 0`),
      uniqueIndex('ix_policy_version_org_version').on(t.orgId, t.policyVersion),
      index('ix_policy_version_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('policy_version_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const budgetConstraint = governanceSchema
  .table(
    'budget_constraint',
    {
      ...standard(),
      policyId: text('policy_id').notNull(),
      scope: text('scope').notNull(),
      scopeId: text('scope_id').notNull(),
      snapshot: jsonb('snapshot').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_budget_constraint', columns: [t.id] }),
      check('ck_budget_constraint_id', idCheck(t.id, 'bdg')),
      check('ck_budget_constraint_org', idCheck(t.orgId, 'org')),
      check('ck_budget_constraint_version', sql`${t.version} > 0`),
      check('ck_budget_constraint_scope', sql`${t.scope} in ('organization','team','project','member')`),
      index('ix_budget_constraint_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('budget_constraint_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const auditEvent = governanceSchema
  .table(
    'audit_event',
    {
      ...standard(),
      eventId: text('event_id').notNull(),
      sequence: bigint('sequence', { mode: 'number' }).notNull(),
      previousHash: text('previous_hash').notNull(),
      hash: text('hash').notNull(),
      event: jsonb('event').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_audit_event', columns: [t.id] }),
      check('ck_audit_event_id', idCheck(t.id, 'aud')),
      check('ck_audit_event_org', idCheck(t.orgId, 'org')),
      check('ck_audit_event_version', sql`${t.version} > 0`),
      uniqueIndex('ix_audit_event_org_event').on(t.orgId, t.eventId),
      uniqueIndex('ix_audit_event_org_sequence').on(t.orgId, t.sequence),
      check('ck_audit_event_sequence', sql`${t.sequence} > 0`),
      index('ix_audit_event_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('audit_event_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const chainCheckpoint = governanceSchema
  .table(
    'chain_checkpoint',
    { ...standard(), sequence: bigint('sequence', { mode: 'number' }).notNull(), hash: text('hash').notNull() },
    (t) => [
      primaryKey({ name: 'pk_chain_checkpoint', columns: [t.id] }),
      check('ck_chain_checkpoint_id', idCheck(t.id, 'chk')),
      check('ck_chain_checkpoint_org', idCheck(t.orgId, 'org')),
      check('ck_chain_checkpoint_version', sql`${t.version} > 0`),
      uniqueIndex('ix_chain_checkpoint_org_sequence').on(t.orgId, t.sequence),
      index('ix_chain_checkpoint_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('chain_checkpoint_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const outbox = governanceSchema
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
export const consumerReceipt = governanceSchema
  .table('consumer_receipt', { ...standard(), eventId: text('event_id').notNull() }, (t) => [
    primaryKey({ name: 'pk_consumer_receipt', columns: [t.id] }),
    check('ck_consumer_receipt_id', idCheck(t.id, 'rcp')),
    check('ck_consumer_receipt_org', idCheck(t.orgId, 'org')),
    check('ck_consumer_receipt_version', sql`${t.version} > 0`),
    uniqueIndex('ix_consumer_receipt_org_event').on(t.orgId, t.eventId),
    index('ix_consumer_receipt_org_created_id').on(t.orgId, t.createdAt, t.id),
    pgPolicy('consumer_receipt_org_isolation', {
      using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
    }),
  ])
  .enableRLS();
