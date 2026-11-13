import { testPool, closeTestPools } from '../infrastructure/test-pools.js';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect, inject } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import { migrateDatabase } from '@fasrun/backend-defaults';
import { newId, type OperationContext } from '@fasrun/contracts-core';
import { type Member, type ObjectFacts, type AdmissionFacts } from '@fasrun/plugin-identity-common';
import { createIdentityRepository } from '../infrastructure/repository.js';
import { identityBaseData } from '../infrastructure/base-data.js';
import { createIdentityService, type IdentityDependencies } from './identity.js';
const orgId = newId('org'),
  otherOrg = newId('org'),
  memberId = newId('mem');
const member: Member = {
  id: memberId,
  orgId,
  active: true,
  issuer: 'https://identity.example.test/realm',
  subject: 'immutable-subject',
  sessionVersion: 1,
  teamIds: [],
  groupIds: [],
};
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: memberId,
    actorKind: 'member',
    orgId,
    clientId: 'test',
    source: 'http',
    traceId: 'trace',
  },
  permission: 'work.create',
  scope: { orgId },
  object: { type: 'work', id: newId('wrk') },
};
const facts: ObjectFacts = {
  conditions: {},
  triggerId: memberId,
  proposerId: 'other',
  applicantId: 'other',
  machineOwnerId: memberId,
  requirementsReviewerIds: [],
  allowRequirementsTrigger: false,
  allowMergeRequirementsReviewer: false,
  independentReviewerIds: ['other'],
  constraints: {},
};
let admission: AdmissionFacts = {
  sourceTrusted: true,
  senderIsBot: false,
  mode: 'off',
  explicitRequest: true,
  ruleApproved: false,
  ruleId: '',
  ruleVersion: '',
  assessmentPassed: false,
  assessmentEvidence: '',
};
describe('T006 real PG identity authorization and lifecycle', () => {
  let database: TestDatabase | undefined;
  let pool: pg.Pool;
  let repository: ReturnType<typeof createIdentityRepository>;
  let service: ReturnType<typeof createIdentityService>;
  let dependencies: IdentityDependencies;
  beforeAll(async () => {
    database = await createTestDatabase(inject('fasrunPostgres'));
    await migrateDatabase({
      connectionString: database.ownerUrl,
      plugins: [
        {
          schema: 'identity',
          migrationsDirectory: fileURLToPath(new URL('../../migrations/', import.meta.url)),
          baseData: identityBaseData(orgId, 'fixture'),
        },
      ],
    });
    pool = testPool({ connectionString: database.appUrl, max: 1 });
    repository = createIdentityRepository(pool);
    await repository.transaction(orgId, 'fixture', async (s) => {
      await s.putMember(member);
      await s.setRole({ id: newId('rol'), memberId, role: 'member', scope: { orgId } });
      await s.setRole({ id: newId('rol'), memberId, role: 'organization_admin', scope: { orgId } });
    });
    dependencies = {
      repository,
      provider: {
        verify: () => Promise.reject(new Error('Use real Keycloak suite for OIDC')),
        authorizationUrl: () => '',
        exchange: () => Promise.reject(new Error('No stub login')),
      },
      audit: { record: () => Promise.resolve() },
      origin: 'https://fasrun.example.test',
      clock: () => new Date(),
      facts: () => Promise.resolve(facts),
      admission: () => Promise.resolve(admission),
      policyVersion: () => Promise.resolve('policy-v1'),
      policyAllows: () => Promise.resolve(true),
    };
    service = createIdentityService(dependencies);
  });
  afterAll(async () => {
    try {
      await closeTestPools(pool);
    } finally {
      await database?.drop();
    }
  });
  it('TC-SF5-IDENTITY-004 current scopes and member resolution are tenant isolated', async () => {
    expect((await service.authorize(context)).allowed).toBe(true);
    expect(await service.resolveMembers(context, [memberId])).toEqual([{ id: memberId, orgId, active: true }]);
    await expect(service.resolveMembers(context, [newId('mem')])).rejects.toThrow();
    await expect(
      service.authorize({ ...context, actor: { ...context.actor, orgId: otherOrg }, scope: { orgId: otherOrg } }),
    ).rejects.toThrow();
    const effective = await service.effectivePermissions(context);
    expect(effective.some((x) => x.permission === 'work.create' && !x.evaluated)).toBe(true);
  });
  it('TC-SF5-IDENTITY-008 immutable intake authorization is idempotent across retries', async () => {
    const input = { intakeId: 'intake-1', requestStrength: 'explicit' as const };
    const [a, b] = await Promise.all([
      service.issueAuthorization(context, input),
      service.issueAuthorization(context, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.ruleIds.length).toBeGreaterThan(0);
    await repository.transaction(orgId, memberId, async (s) => {
      expect((await s.authorization(a.id))?.revoked).toBe(false);
    });
    await expect(
      service.issueAuthorization({ ...context, scope: { orgId, projectId: 'expanded' } }, input),
    ).rejects.toThrow('Identity operation denied');
    const admin = new pg.Client({ connectionString: database!.ownerUrl });
    await admin.connect();
    try {
      await expect(admin.query('delete from identity.authorization_record where id=$1', [a.id])).rejects.toMatchObject({
        code: '55000',
      });
      await expect(
        admin.query('update identity.authorization_record set version=2 where id=$1', [a.id]),
      ).rejects.toMatchObject({ code: '55000' });
    } finally {
      await admin.end();
    }
  });
  it('TC-SF5-IDENTITY-007/011 explicit revocation rejects next check; rule changes do not rewrite authorization', async () => {
    const a = await service.issueAuthorization(context, { intakeId: 'intake-revoke', requestStrength: 'explicit' });
    const authorized = { ...context, actor: { ...context.actor, authorizationId: a.id } };
    expect((await service.authorize(authorized)).allowed).toBe(true);
    await service.saveRule(context, {
      id: 'custom-work',
      scope: { orgId },
      permission: 'work.create',
      domain: { kind: 'member', id: memberId },
      condition: { must: [] },
      policyVersion: 'v2',
      isCustomized: true,
    });
    expect((await repository.transaction(orgId, memberId, (s) => s.authorization(a.id)))?.snapshot.policyVersion).toBe(
      'policy-v1',
    );
    await service.revoke(context, { authorizationId: a.id, reason: 'explicit revocation', idempotencyKey: 'revoke-1' });
    expect((await service.authorize(authorized)).allowed).toBe(false);
  });
  it('TC-SF5-IDENTITY-009/010 candidate modes cannot turn bot text into explicit authority', async () => {
    admission = { ...admission, explicitRequest: false, senderIsBot: true, mode: 'observe' };
    await expect(
      service.issueAuthorization(context, { intakeId: 'candidate', requestStrength: 'candidate' }),
    ).rejects.toThrow();
    admission = { ...admission, mode: 'auto' };
    await expect(
      service.issueAuthorization(context, { intakeId: 'auto-no-rule', requestStrength: 'proactive' }),
    ).rejects.toThrow();
    admission = {
      ...admission,
      ruleApproved: true,
      ruleId: 'approved-rule',
      ruleVersion: 'v1',
      assessmentPassed: true,
      assessmentEvidence: 'trusted-assessment',
    };
    expect(
      (await service.issueAuthorization(context, { intakeId: 'auto-approved', requestStrength: 'proactive' }))
        .requestStrength,
    ).toBe('proactive');
    admission = { ...admission, explicitRequest: true, senderIsBot: false };
  });
  it('TC-SF5-IDENTITY-003 immutable external ID association records unresolved requests for authorized replay', async () => {
    const source = {
      provider: 'github',
      issuer: 'installation:123',
      subject: 'external-id-456',
      eventId: 'github-event',
    };
    expect(await service.resolveExternal(context, source)).toEqual({ kind: 'unresolved' });
    const [issue] = await service.associationIssues(context);
    expect(issue?.subject).toBe(source.subject);
    await service.linkExternal(context, { ...source, memberId }, issue!.id);
    expect(await service.resolveExternal(context, source)).toEqual({ kind: 'resolved', memberId });
    expect((await service.associationIssues(context))[0]?.state).toBe('resolved');
  });
  it('TC-SF5-IDENTITY-007 target scope, role identity and atomic audit cannot be bypassed', async () => {
    const limitedId = newId('mem'),
      otherId = newId('mem'),
      projectA = { orgId, projectId: 'a' },
      projectB = { orgId, projectId: 'b' },
      roleId = newId('rol');
    await repository.transaction(orgId, memberId, async (s) => {
      await s.putMember({ ...member, id: limitedId, subject: 'limited' });
      await s.putMember({ ...member, id: otherId, subject: 'other' });
      await s.setRole({ id: newId('rol'), memberId: limitedId, role: 'organization_admin', scope: projectA });
      await s.setRole({ id: roleId, memberId: otherId, role: 'member', scope: projectB });
    });
    const limited = { ...context, actor: { ...context.actor, actorId: limitedId }, scope: projectA };
    await expect(
      service.assignRole(limited, { id: newId('rol'), memberId: otherId, role: 'member', scope: projectB }),
    ).rejects.toThrow();
    await expect(service.removeRole(limited, roleId)).rejects.toThrow();
    await expect(
      service.setMember(limited, { ...member, id: otherId, subject: 'other', active: false }),
    ).rejects.toThrow();
    await expect(
      service.saveRule(limited, {
        id: 'foreign-rule',
        scope: projectB,
        permission: 'pr.merge',
        domain: { kind: 'member', id: limitedId },
        condition: { must: [] },
        policyVersion: 'v1',
        isCustomized: true,
      }),
    ).rejects.toThrow();
    await expect(
      service.assignRole(context, { id: roleId, memberId: limitedId, role: 'platform_admin', scope: projectB }),
    ).rejects.toThrow();
    await expect(
      repository.transaction(orgId, memberId, (s) =>
        s.setRole({ id: roleId, memberId: limitedId, role: 'member', scope: projectB }),
      ),
    ).rejects.toThrow('immutable');
    await expect(service.setMember(context, { ...member, issuer: 'https://changed.example.test' })).rejects.toThrow();
    const admin = new pg.Client({ connectionString: database!.ownerUrl });
    await admin.connect();
    try {
      await admin.query(
        "create function identity.test_reject_audit() returns trigger language plpgsql as $$ begin if NEW.event->>'topic'='governance.audit.requested' then raise exception 'audit unavailable'; end if; return NEW; end; $$; create trigger test_reject_audit before insert on identity.outbox for each row execute function identity.test_reject_audit()",
      );
      await expect(
        service.assignRole(context, { id: newId('rol'), memberId: otherId, role: 'design_reviewer', scope: projectB }),
      ).rejects.toThrow();
      expect((await repository.transaction(orgId, memberId, (s) => s.roles(otherId))).map((r) => r.role)).toEqual([
        'member',
      ]);
    } finally {
      await admin.query(
        'drop trigger test_reject_audit on identity.outbox; drop function identity.test_reject_audit()',
      );
      await admin.end();
    }
  });
  it('TC-SF5-IDENTITY-008 stable intake tolerates trace changes and rejects a withdrawn final authorization', async () => {
    const request = { intakeId: 'stable-trace', requestStrength: 'explicit' as const };
    const first = await service.issueAuthorization(context, request),
      again = await service.issueAuthorization(
        { ...context, actor: { ...context.actor, traceId: 'new-trace', clientId: 'retry-client' } },
        request,
      );
    expect(first.id).toBe(again.id);
    let calls = 0;
    const racing = createIdentityService({ ...dependencies, policyAllows: () => Promise.resolve(++calls === 1) });
    await expect(
      racing.issueAuthorization(context, { intakeId: 'denied-second-check', requestStrength: 'explicit' }),
    ).rejects.toThrow();
    expect(await repository.transaction(orgId, memberId, (s) => s.byIntake('denied-second-check'))).toBeUndefined();
  });
  it('TC-SF5-IDENTITY-004 effective permissions omit another member grants and retain dynamic conditions', async () => {
    await service.saveRule(context, {
      id: 'others-only',
      scope: { orgId },
      permission: 'pr.merge',
      domain: { kind: 'member', id: 'different-member' },
      condition: { must: [] },
      policyVersion: 'v1',
      isCustomized: true,
    });
    const effective = await service.effectivePermissions(context);
    expect(effective.some((r) => r.ruleIds.includes('others-only'))).toBe(false);
    expect(effective.find((r) => r.ruleIds.includes('builtin.work.answer.trigger'))?.conditions[0]).toMatchObject({
      must: [{ condition: 'subject_in_domain', params: { domain: 'trigger' } }],
    });
  });
  it('TC-SF5-IDENTITY-005 distinct internal agent requires bound live authorization and all permission intersections', async () => {
    const authorization = await service.issueAuthorization(context, {
      intakeId: 'agent-intake',
      requestStrength: 'explicit',
    });
    const agent = {
      ...context,
      actor: {
        ...context.actor,
        actorId: 'internal-agent-1',
        actorKind: 'agent' as const,
        authorizationId: authorization.id,
      },
    };
    const events: { actorId: string; action: string; details: Record<string, string> }[] = [];
    const goodBinding = {
      agentId: agent.actor.actorId,
      memberId,
      authorizationId: authorization.id,
      projectPermissions: ['work.create'],
      environmentPermissions: ['work.create'],
    };
    const bound = (binding: typeof goodBinding | undefined) =>
      createIdentityService({
        ...dependencies,
        agentIdentity: () => Promise.resolve(binding),
        audit: {
          record: (ctx, action, _outcome, details) => {
            events.push({ actorId: ctx.actor.actorId, action, details: details ?? {} });
            return Promise.resolve();
          },
        },
      });
    expect((await bound(goodBinding).authorize(agent)).allowed).toBe(true);
    await expect(bound(undefined).authorize(agent)).rejects.toThrow('denied');
    await expect(bound({ ...goodBinding, memberId: 'unrelated' }).authorize(agent)).rejects.toThrow('denied');
    await expect(bound({ ...goodBinding, agentId: 'wrong-agent' }).authorize(agent)).rejects.toThrow('denied');
    expect((await bound({ ...goodBinding, environmentPermissions: [] }).authorize(agent)).allowed).toBe(false);
    expect((await bound({ ...goodBinding, projectPermissions: [] }).authorize(agent)).allowed).toBe(false);
    const restricted = { ...authorization, id: newId('aut'), intakeId: 'agent-no-task-permissions' };
    await repository.transaction(orgId, memberId, (s) => s.issue(restricted, []));
    expect(
      (
        await bound({ ...goodBinding, authorizationId: restricted.id }).authorize({
          ...agent,
          actor: { ...agent.actor, authorizationId: restricted.id },
        })
      ).allowed,
    ).toBe(false);
    expect(events.at(-1)).toMatchObject({ actorId: 'internal-agent-1', details: { effectiveMemberId: memberId } });
    expect((await bound(goodBinding).authorize({ ...agent, permission: 'spec.approve_design' })).allowed).toBe(false);
    await expect(
      bound(goodBinding).issueAuthorization(agent, {
        intakeId: 'agent-cannot-redelegate',
        requestStrength: 'explicit',
      }),
    ).rejects.toThrow();
    await service.revoke(context, {
      authorizationId: authorization.id,
      reason: 'end agent invocation',
      idempotencyKey: 'revoke-agent',
    });
    await expect(bound(goodBinding).authorize(agent)).rejects.toThrow('denied');
    expect(events.at(-1)).toMatchObject({ actorId: 'internal-agent-1', action: 'identity.operation.denied' });
  });
  it('TC-SF5-IDENTITY-004/006 rejects damaged conditions and evaluates team/group domains before exposing effective permissions', async () => {
    const user = { ...member, id: newId('mem'), subject: 'domains', teamIds: ['team-a'], groupIds: ['group-a'] };
    await service.setMember(context, user);
    const scoped = {
      ...context,
      actor: { ...context.actor, actorId: user.id },
      scope: { orgId, projectId: 'restricted' },
    };
    await repository.transaction(orgId, memberId, async (s) => {
      await s.setRole({ id: newId('rol'), memberId: user.id, role: 'member', scope: { orgId } });
      await s.putProjectScope(user.id, scoped.scope);
    });
    expect((await service.authorize(scoped)).allowed).toBe(true);
    expect((await service.authorize({ ...scoped, scope: { orgId, projectId: 'outside' } })).reason).toBe(
      'project-scope-denied',
    );
    for (const kind of ['team', 'group'] as const)
      for (const id of [kind + '-a', kind + '-b'])
        await service.saveRule(context, {
          id: 'domain-' + id,
          scope: { orgId },
          permission: 'work.view',
          domain: { kind, id },
          condition: { must: [] },
          policyVersion: 'v1',
          isCustomized: true,
        });
    const effective = await service.effectivePermissions(scoped);
    expect(
      effective
        .filter((r) => r.ruleIds.some((id) => id.startsWith('domain-')))
        .flatMap((r) => r.ruleIds)
        .sort(),
    ).toEqual(['domain-group-a', 'domain-team-a']);
    const admin = new pg.Client({ connectionString: database!.ownerUrl });
    await admin.connect();
    try {
      await admin.query(
        `update identity.permission_rule set definition=jsonb_set(definition,'{condition}', '{"must":[{"condition":"unknown_condition"}]}') where org_id=$1 and rule_key='domain-team-a'`,
        [orgId],
      );
      expect((await service.authorize(scoped)).reason).toBe('invalid-permission-rule');
      await expect(service.effectivePermissions(scoped)).rejects.toThrow('denied');
    } finally {
      await admin.query("delete from identity.permission_rule where org_id=$1 and rule_key like 'domain-%'", [orgId]);
      await admin.end();
    }
  });
  it('TC-SF5-IDENTITY-007 validates immutable role and rule targets including platform separation', async () => {
    const user = { ...member, id: newId('mem'), subject: 'role-target' };
    await service.setMember(context, user);
    const assignment = {
      id: newId('rol'),
      memberId: user.id,
      role: 'member' as const,
      scope: { orgId, projectId: 'immutable' },
    };
    await service.assignRole(context, assignment);
    await service.assignRole(context, assignment);
    for (const change of [{ memberId }, { scope: { orgId } }, { scope: { orgId, projectId: 'other' } }])
      await expect(service.assignRole(context, { ...assignment, ...change })).rejects.toThrow('denied');
    await expect(
      service.assignRole(context, { ...assignment, id: newId('rol'), memberId: newId('mem') }),
    ).rejects.toThrow('denied');
    await expect(service.removeRole(context, newId('rol'))).rejects.toThrow('denied');
    await expect(
      service.revoke(context, { authorizationId: newId('aut'), reason: 'missing', idempotencyKey: 'missing' }),
    ).rejects.toThrow('denied');
    const platformId = newId('mem'),
      platformRole = newId('rol');
    await repository.transaction(orgId, memberId, async (s) => {
      await s.putMember({ ...member, id: platformId, subject: 'platform' });
      await s.setRole({ id: platformRole, memberId: platformId, role: 'platform_admin', scope: { orgId } });
    });
    await expect(
      service.assignRole(context, { id: platformRole, memberId: platformId, role: 'member', scope: { orgId } }),
    ).rejects.toThrow('denied');
    const platform = { ...context, actor: { ...context.actor, actorId: platformId } };
    const assigned = { id: newId('rol'), memberId: user.id, role: 'platform_auditor' as const, scope: { orgId } };
    await service.assignRole(platform, assigned);
    await service.removeRole(platform, assigned.id);
    const privilegedRule = {
      id: 'protected-existing',
      scope: { orgId },
      permission: 'integration.manage' as const,
      domain: { kind: 'member' as const, id: platformId },
      condition: { must: [] },
      policyVersion: 'v1',
      isCustomized: true,
    };
    await service.saveRule(platform, privilegedRule);
    await expect(service.saveRule(context, { ...privilegedRule, permission: 'work.view' })).rejects.toThrow('denied');
    const rule = {
      id: 'fixed-rule-scope',
      scope: { orgId, projectId: 'original' },
      permission: 'work.view' as const,
      domain: { kind: 'member' as const, id: user.id },
      condition: { must: [] },
      policyVersion: 'v1',
      isCustomized: true,
    };
    await service.saveRule(context, rule);
    await service.saveRule(context, { ...rule, policyVersion: 'v2' });
    await expect(service.saveRule(context, { ...rule, scope: { orgId } })).rejects.toThrow('denied');
    await expect(service.saveRule(context, { ...rule, scope: { orgId, projectId: 'other' } })).rejects.toThrow(
      'denied',
    );
    for (const permission of ['org.provision', 'integration.manage'] as const)
      await expect(service.saveRule(context, { ...rule, id: 'platform-escalation', permission })).rejects.toThrow(
        'denied',
      );
  });
  it('TC-SF5-IDENTITY-002/003 fails closed for stale sessions, inactive associations and failed audit delivery', async () => {
    const user = { ...member, id: newId('mem'), subject: 'sessions' },
      raw = 'test-session-token';
    await service.setMember(context, user);
    const request = {
      orgId,
      clientId: 'session-test',
      source: 'http' as const,
      traceId: 'session-trace',
      method: 'GET',
    };
    await repository.transaction(orgId, memberId, (s) =>
      s.saveSession({
        digest: createHash('sha256').update(raw).digest('hex'),
        memberId: user.id,
        sessionVersion: 1,
        csrfDigest: 'not-used',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        revoked: false,
      }),
    );
    expect((await service.authenticateSession(raw, request)).actorId).toBe(user.id);
    await expect(service.logout(context, raw)).rejects.toThrow('denied');
    await service.setMember(context, user);
    await expect(service.authenticateSession(raw, request)).rejects.toThrow('denied');
    const account = {
      provider: 'github',
      issuer: 'installation:222',
      subject: 'external-session-user',
      memberId: user.id,
    };
    await service.linkExternal(context, account);
    await expect(
      service.linkExternal(context, { ...account, subject: 'wrong-issue' }, 'unknown-issue'),
    ).rejects.toThrow('denied');
    await service.setMember(context, { ...user, active: false });
    expect(await service.resolveExternal(context, { ...account, eventId: 'disabled-associated-event' })).toEqual({
      kind: 'unresolved',
    });
    await expect(service.linkExternal(context, account)).rejects.toThrow('denied');
    const failAudit = createIdentityService({
      ...dependencies,
      audit: { record: () => Promise.reject(new Error('postgres://user:secret@private-host')) },
    });
    await expect(failAudit.authenticateContext('unknown', request)).rejects.toThrow('Identity operation unavailable');
  });
  it('TC-SF5-IDENTITY-004 persistence enforces role values and immutable identity uniqueness', async () => {
    const admin = new pg.Client({ connectionString: database!.ownerUrl });
    await admin.connect();
    try {
      await expect(
        admin.query(
          'insert into identity.role_assignment(id,org_id,created_by,member_id,role,scope) values($1,$2,$3,$3,$4,$5)',
          [newId('rol'), orgId, memberId, 'unlisted_superuser', { orgId }],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'ck_role_assignment_role' });
      await expect(
        repository.transaction(orgId, memberId, (s) => s.putMember({ ...member, id: newId('mem') })),
      ).rejects.toMatchObject({ code: '23505', constraint: 'ix_member_identity' });
    } finally {
      await admin.end();
    }
  });
  it('TC-SF5-IDENTITY-002/007 role withdrawal and member disable apply immediately', async () => {
    const role = { id: newId('rol'), memberId, role: 'design_reviewer' as const, scope: { orgId } };
    await service.assignRole(context, role);
    const review = { ...context, permission: 'spec.approve_design' };
    expect((await service.authorize(review)).allowed).toBe(true);
    await service.removeRole(context, role.id);
    expect((await service.authorize(review)).allowed).toBe(false);
    await service.setMember(context, { ...member, active: false });
    await expect(service.authorize(context)).rejects.toThrow();
  });
});
