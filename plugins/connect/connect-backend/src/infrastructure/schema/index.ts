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
export const connectSchema = pgSchema('connect');
const standard = () => ({
  id: text('id').notNull(),
  orgId: text('org_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
  version: integer('version').notNull().default(1),
});
export const integration = connectSchema
  .table(
    'integration',
    {
      ...standard(),
      installationId: text('installation_id').notNull(),
      provider: text('provider').notNull(),
      active: boolean('active').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_integration', columns: [t.id] }),
      check('ck_integration_id', idCheck(t.id, 'int')),
      check('ck_integration_org', idCheck(t.orgId, 'org')),
      check('ck_integration_version', sql`${t.version} > 0`),
      check('ck_integration_provider', sql`${t.provider} = 'github'`),
      uniqueIndex('ix_integration_identity').on(t.orgId, t.installationId),
      uniqueIndex('ix_integration_installation').on(t.installationId),
      pgPolicy('integration_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const repositoryBinding = connectSchema
  .table(
    'repository_binding',
    {
      ...standard(),
      integrationId: text('integration_id').notNull(),
      repositoryId: text('repository_id').notNull(),
      teamId: text('team_id').notNull(),
      projectId: text('project_id').notNull(),
      active: boolean('active').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_repository_binding', columns: [t.id] }),
      check('ck_repository_binding_id', idCheck(t.id, 'rpb')),
      check('ck_repository_binding_org', idCheck(t.orgId, 'org')),
      check('ck_repository_binding_version', sql`${t.version} > 0`),
      uniqueIndex('ix_repository_binding_identity').on(t.orgId, t.integrationId, t.repositoryId),
      pgPolicy('repository_binding_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const externalObject = connectSchema
  .table(
    'external_object',
    {
      ...standard(),
      integrationId: text('integration_id').notNull(),
      repositoryId: text('repository_id').notNull(),
      externalId: text('external_id').notNull(),
      kind: text('kind').notNull(),
      observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
      digest: text('digest').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_external_object', columns: [t.id] }),
      check('ck_external_object_id', idCheck(t.id, 'ext')),
      check('ck_external_object_org', idCheck(t.orgId, 'org')),
      check('ck_external_object_version', sql`${t.version} > 0`),
      check('ck_external_object_kind', sql`${t.kind} in ('issue','pull_request','review','discussion')`),
      uniqueIndex('ix_external_object_identity').on(t.orgId, t.integrationId, t.externalId, t.kind),
      pgPolicy('external_object_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const discussion = connectSchema
  .table(
    'discussion',
    {
      ...standard(),
      integrationId: text('integration_id').notNull(),
      externalId: text('external_id').notNull(),
      repositoryId: text('repository_id').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_discussion', columns: [t.id] }),
      check('ck_discussion_id', idCheck(t.id, 'dsc')),
      check('ck_discussion_org', idCheck(t.orgId, 'org')),
      check('ck_discussion_version', sql`${t.version} > 0`),
      uniqueIndex('ix_discussion_identity').on(t.orgId, t.integrationId, t.externalId),
      pgPolicy('discussion_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const inbox = connectSchema
  .table(
    'inbox',
    {
      ...standard(),
      installationId: text('installation_id').notNull(),
      deliveryId: text('delivery_id').notNull(),
      repositoryId: text('repository_id').notNull(),
      event: jsonb('event').notNull(),
      receipt: jsonb('receipt').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_inbox', columns: [t.id] }),
      check('ck_inbox_id', idCheck(t.id, 'inb')),
      check('ck_inbox_org', idCheck(t.orgId, 'org')),
      check('ck_inbox_version', sql`${t.version} > 0`),
      uniqueIndex('ix_inbox_identity').on(t.orgId, t.installationId, t.deliveryId),
      pgPolicy('inbox_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const reconcileCursor = connectSchema
  .table(
    'reconcile_cursor',
    {
      ...standard(),
      integrationId: text('integration_id').notNull(),
      repositoryId: text('repository_id').notNull(),
      cursor: text('cursor'),
      highWatermark: timestamp('high_watermark', { withTimezone: true }),
    },
    (t) => [
      primaryKey({ name: 'pk_reconcile_cursor', columns: [t.id] }),
      check('ck_reconcile_cursor_id', idCheck(t.id, 'cur')),
      check('ck_reconcile_cursor_org', idCheck(t.orgId, 'org')),
      check('ck_reconcile_cursor_version', sql`${t.version} > 0`),
      uniqueIndex('ix_reconcile_cursor_identity').on(t.orgId, t.integrationId, t.repositoryId),
      pgPolicy('reconcile_cursor_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const outboundAction = connectSchema
  .table(
    'outbound_action',
    {
      ...standard(),
      integrationId: text('integration_id').notNull(),
      actionKey: text('action_key').notNull(),
      requestHash: text('request_hash').notNull(),
      target: text('target').notNull(),
      state: text('state').notNull(),
      leaseToken: text('lease_token'),
      leaseUntil: timestamp('lease_until', { withTimezone: true }),
      retryAt: timestamp('retry_at', { withTimezone: true }),
      result: jsonb('result'),
    },
    (t) => [
      primaryKey({ name: 'pk_outbound_action', columns: [t.id] }),
      check('ck_outbound_action_id', idCheck(t.id, 'act')),
      check('ck_outbound_action_org', idCheck(t.orgId, 'org')),
      check('ck_outbound_action_version', sql`${t.version} > 0`),
      check('ck_outbound_action_state', sql`${t.state} in ('pending','succeeded','failed','unknown')`),
      uniqueIndex('ix_outbound_action_identity').on(t.orgId, t.actionKey),
      pgPolicy('outbound_action_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const credentialEnvelope = connectSchema
  .table(
    'credential_envelope',
    {
      ...standard(),
      integrationId: text('integration_id').notNull(),
      credentialVersion: text('credential_version').notNull(),
      envelope: jsonb('envelope').notNull(),
      active: boolean('active').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_credential_envelope', columns: [t.id] }),
      check('ck_credential_envelope_id', idCheck(t.id, 'cre')),
      check('ck_credential_envelope_org', idCheck(t.orgId, 'org')),
      check('ck_credential_envelope_version', sql`${t.version} > 0`),
      uniqueIndex('ix_credential_envelope_identity').on(t.orgId, t.integrationId, t.credentialVersion),
      uniqueIndex('ix_credential_envelope_active')
        .on(t.orgId, t.integrationId)
        .where(sql`${t.active}`),
      pgPolicy('credential_envelope_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const outbox = connectSchema
  .table(
    'outbox',
    {
      ...standard(),
      eventId: text('event_id').notNull(),
      event: jsonb('event').notNull(),
      leaseToken: text('lease_token'),
      leaseUntil: timestamp('lease_until', { withTimezone: true }),
      retryAt: timestamp('retry_at', { withTimezone: true }).notNull().defaultNow(),
      deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    },
    (t) => [
      primaryKey({ name: 'pk_outbox', columns: [t.id] }),
      check('ck_outbox_id', idCheck(t.id, 'obx')),
      check('ck_outbox_org', idCheck(t.orgId, 'org')),
      check('ck_outbox_version', sql`${t.version} > 0`),
      uniqueIndex('ix_outbox_identity').on(t.orgId, t.eventId),
      pgPolicy('outbox_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const consumerReceipt = connectSchema
  .table(
    'consumer_receipt',
    { ...standard(), eventId: text('event_id').notNull(), consumer: text('consumer').notNull() },
    (t) => [
      primaryKey({ name: 'pk_consumer_receipt', columns: [t.id] }),
      check('ck_consumer_receipt_id', idCheck(t.id, 'rcp')),
      check('ck_consumer_receipt_org', idCheck(t.orgId, 'org')),
      check('ck_consumer_receipt_version', sql`${t.version} > 0`),
      uniqueIndex('ix_consumer_receipt_identity').on(t.orgId, t.eventId, t.consumer),
      pgPolicy('consumer_receipt_org_isolation', {
        using: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId} = current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
