import { ROLES } from '@fasrun/plugin-identity-common';
import { idCheck } from '@fasrun/backend-defaults';
import { sql } from 'drizzle-orm';
import {
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { identitySchema } from './organization.js';
const standard = () => ({
  id: text('id').notNull(),
  orgId: text('org_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
  version: integer('version').notNull().default(1),
});
export const team = identitySchema
  .table('team', { ...standard(), name: text('name').notNull() }, (t) => [
    primaryKey({ name: 'pk_team', columns: [t.id] }),
    check('ck_team_id', idCheck(t.id, 'tem')),
    check('ck_team_org', idCheck(t.orgId, 'org')),
    check('ck_team_version', sql`${t.version}>0`),
    index('ix_team_org_created_id').on(t.orgId, t.createdAt, t.id),
    pgPolicy('team_org_isolation', {
      using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
    }),
  ])
  .enableRLS();
export const member = identitySchema
  .table(
    'member',
    {
      ...standard(),
      issuer: text('issuer').notNull(),
      subject: text('subject').notNull(),
      active: boolean('active').notNull().default(true),
      sessionVersion: integer('session_version').notNull().default(1),
      profile: jsonb('profile').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_member', columns: [t.id] }),
      check('ck_member_id', idCheck(t.id, 'mem')),
      check('ck_member_org', idCheck(t.orgId, 'org')),
      check('ck_member_version', sql`${t.version}>0`),
      index('ix_member_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_member_identity').on(t.orgId, t.issuer, t.subject),
      pgPolicy('member_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const externalAccount = identitySchema
  .table(
    'external_account',
    {
      ...standard(),
      provider: text('provider').notNull(),
      issuer: text('issuer').notNull(),
      subject: text('subject').notNull(),
      memberId: text('member_id').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_external_account', columns: [t.id] }),
      check('ck_external_account_id', idCheck(t.id, 'ext')),
      check('ck_external_account_org', idCheck(t.orgId, 'org')),
      check('ck_external_account_version', sql`${t.version}>0`),
      index('ix_external_account_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_external_account_identity').on(t.orgId, t.provider, t.issuer, t.subject),
      pgPolicy('external_account_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const roleAssignment = identitySchema
  .table(
    'role_assignment',
    {
      ...standard(),
      memberId: text('member_id').notNull(),
      role: text('role').notNull(),
      scope: jsonb('scope').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_role_assignment', columns: [t.id] }),
      check('ck_role_assignment_id', idCheck(t.id, 'rol')),
      check('ck_role_assignment_org', idCheck(t.orgId, 'org')),
      check('ck_role_assignment_version', sql`${t.version}>0`),
      check('ck_role_assignment_role', sql`${t.role} in (${sql.raw(ROLES.map((role) => `'${role}'`).join(','))})`),
      index('ix_role_assignment_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('role_assignment_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const permissionRule = identitySchema
  .table(
    'permission_rule',
    {
      ...standard(),
      ruleKey: text('rule_key').notNull(),
      definition: jsonb('definition').notNull(),
      isCustomized: boolean('is_customized').notNull().default(false),
    },
    (t) => [
      primaryKey({ name: 'pk_permission_rule', columns: [t.id] }),
      check('ck_permission_rule_id', idCheck(t.id, 'rul')),
      check('ck_permission_rule_org', idCheck(t.orgId, 'org')),
      check('ck_permission_rule_version', sql`${t.version}>0`),
      index('ix_permission_rule_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_permission_rule_identity').on(t.orgId, t.ruleKey),
      pgPolicy('permission_rule_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const projectScope = identitySchema
  .table(
    'project_scope',
    { ...standard(), memberId: text('member_id').notNull(), scope: jsonb('scope').notNull() },
    (t) => [
      primaryKey({ name: 'pk_project_scope', columns: [t.id] }),
      check('ck_project_scope_id', idCheck(t.id, 'prj')),
      check('ck_project_scope_org', idCheck(t.orgId, 'org')),
      check('ck_project_scope_version', sql`${t.version}>0`),
      index('ix_project_scope_org_created_id').on(t.orgId, t.createdAt, t.id),
      pgPolicy('project_scope_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const authorizationRecord = identitySchema
  .table(
    'authorization_record',
    {
      ...standard(),
      intakeId: text('intake_id').notNull(),
      snapshot: jsonb('snapshot').notNull(),
      permissions: jsonb('permissions').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_authorization_record', columns: [t.id] }),
      check('ck_authorization_record_id', idCheck(t.id, 'aut')),
      check('ck_authorization_record_org', idCheck(t.orgId, 'org')),
      check('ck_authorization_record_version', sql`${t.version}>0`),
      index('ix_authorization_record_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_authorization_record_identity').on(t.orgId, t.intakeId),
      pgPolicy('authorization_record_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const authorizationRevocation = identitySchema
  .table(
    'authorization_revocation',
    {
      ...standard(),
      authorizationId: text('authorization_id').notNull(),
      reason: text('reason').notNull(),
      idempotencyKey: text('idempotency_key').notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_authorization_revocation', columns: [t.id] }),
      check('ck_authorization_revocation_id', idCheck(t.id, 'rev')),
      check('ck_authorization_revocation_org', idCheck(t.orgId, 'org')),
      check('ck_authorization_revocation_version', sql`${t.version}>0`),
      index('ix_authorization_revocation_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_authorization_revocation_identity').on(t.orgId, t.idempotencyKey),
      pgPolicy('authorization_revocation_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const session = identitySchema
  .table(
    'session',
    {
      ...standard(),
      digest: text('digest').notNull(),
      memberId: text('member_id').notNull(),
      sessionVersion: integer('session_version').notNull(),
      csrfDigest: text('csrf_digest').notNull(),
      expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
      revoked: boolean('revoked').notNull().default(false),
    },
    (t) => [
      primaryKey({ name: 'pk_session', columns: [t.id] }),
      check('ck_session_id', idCheck(t.id, 'ses')),
      check('ck_session_org', idCheck(t.orgId, 'org')),
      check('ck_session_version', sql`${t.version}>0`),
      index('ix_session_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_session_identity').on(t.orgId, t.digest),
      pgPolicy('session_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const loginChallenge = identitySchema
  .table(
    'login_challenge',
    {
      ...standard(),
      stateDigest: text('state_digest').notNull(),
      browserDigest: text('browser_digest').notNull(),
      verifier: text('verifier').notNull(),
      nonce: text('nonce').notNull(),
      expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    },
    (t) => [
      primaryKey({ name: 'pk_login_challenge', columns: [t.id] }),
      check('ck_login_challenge_id', idCheck(t.id, 'log')),
      check('ck_login_challenge_org', idCheck(t.orgId, 'org')),
      check('ck_login_challenge_version', sql`${t.version}>0`),
      index('ix_login_challenge_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_login_challenge_identity').on(t.orgId, t.stateDigest),
      pgPolicy('login_challenge_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const associationIssue = identitySchema
  .table(
    'association_issue',
    {
      ...standard(),
      provider: text('provider').notNull(),
      issuer: text('issuer').notNull(),
      subject: text('subject').notNull(),
      eventId: text('event_id').notNull(),
      state: text('state').notNull().default('pending'),
    },
    (t) => [
      primaryKey({ name: 'pk_association_issue', columns: [t.id] }),
      check('ck_association_issue_id', idCheck(t.id, 'iss')),
      check('ck_association_issue_org', idCheck(t.orgId, 'org')),
      check('ck_association_issue_version', sql`${t.version}>0`),
      index('ix_association_issue_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_association_issue_identity').on(t.orgId, t.eventId),
      check('ck_association_issue_state', sql`${t.state} in ('pending','resolved')`),
      pgPolicy('association_issue_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const candidate = identitySchema
  .table(
    'candidate',
    { ...standard(), intakeId: text('intake_id').notNull(), evidence: jsonb('evidence').notNull() },
    (t) => [
      primaryKey({ name: 'pk_candidate', columns: [t.id] }),
      check('ck_candidate_id', idCheck(t.id, 'can')),
      check('ck_candidate_org', idCheck(t.orgId, 'org')),
      check('ck_candidate_version', sql`${t.version}>0`),
      index('ix_candidate_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_candidate_identity').on(t.orgId, t.intakeId),
      pgPolicy('candidate_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
export const outbox = identitySchema
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
      check('ck_outbox_version', sql`${t.version}>0`),
      index('ix_outbox_org_created_id').on(t.orgId, t.createdAt, t.id),
      uniqueIndex('ix_outbox_identity').on(t.orgId, t.eventId),
      check('ck_outbox_state', sql`${t.state} in ('pending','leased','delivered')`),
      pgPolicy('outbox_org_isolation', {
        using: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
        withCheck: sql`${t.orgId}=current_setting('fasrun.org_id',true)`,
      }),
    ],
  )
  .enableRLS();
