import { jsonValueSchema, type OperationContext } from '@fasrun/contracts-core';
import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent, AuditRecord, PolicySnapshot, PolicyEvaluation } from '@fasrun/plugin-governance-common';
import type { GovernanceRepository, GovernanceSession } from '../common/ports.js';
import { auditHash, GENESIS_HASH } from '../common/audit-hash.js';
import { createGovernanceService, verifyAuditChain } from './governance.js';
import { createRedactor, safeDiagnostics } from './redaction.js';
const actor = {
  version: 1,
  actorId: 'member',
  actorKind: 'member',
  orgId: 'org',
  clientId: 'cli',
  source: 'http',
  traceId: 'trace',
} as const;
const context = { actor, permission: 'work.view', scope: { orgId: 'org' }, object: { type: 'work', id: 'work' } };
const policy: PolicySnapshot = {
  version: 1,
  id: 'policy',
  orgId: 'org',
  policyVersion: 'v1',
  constraints: { budgets: [], allowedReadScopes: [{ orgId: 'org' }], excludedChannels: [] },
};
const input: PolicyEvaluation = {
  context,
  facts: {},
  estimatedUnitCost: 1,
  retryLimit: 0,
  references: [],
  channel: 'model',
};
function setup() {
  const records: AuditRecord[] = [];
  let current: PolicySnapshot | undefined = structuredClone(policy);
  let checkpoint: { orgId: string; sequence: number; hash: string } | undefined;
  let ids = 0;
  const session = {
    policy: vi.fn<GovernanceSession['policy']>(() => Promise.resolve(current)),
    publishPolicy: vi.fn<GovernanceSession['publishPolicy']>((value) => {
      current = value;
      return Promise.resolve();
    }),
    appendAudit: vi.fn<GovernanceSession['appendAudit']>((event) => {
      const previousHash = records.at(-1)?.hash ?? GENESIS_HASH;
      const record = { event, sequence: records.length + 1, previousHash, hash: auditHash(previousHash, event) };
      records.push(record);
      return Promise.resolve(record);
    }),
    auditRecords: vi.fn<GovernanceSession['auditRecords']>(() => Promise.resolve(structuredClone(records))),
    enqueue: vi.fn(),
    consume: vi.fn<GovernanceSession['consume']>(async (_id, work) => {
      await work();
      return true;
    }),
  } satisfies GovernanceSession;
  let transactionActive = false;
  const repository: GovernanceRepository = {
    transaction: async (_org, _actor, work) => {
      // Models a one-connection pool without hanging a broken test forever.
      if (transactionActive) throw new Error('Nested transaction would exhaust the pool');
      transactionActive = true;
      try {
        return await work(session);
      } finally {
        transactionActive = false;
      }
    },
    outbox: vi.fn(),
  };
  const authorize = vi.fn<(context: OperationContext) => Promise<boolean>>().mockResolvedValue(true);
  const authorizeAudit = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const checkpoints = {
    load: vi.fn(() => Promise.resolve(checkpoint)),
    publish: vi.fn((value: { orgId: string; sequence: number; hash: string }) => {
      checkpoint = value;
      return Promise.resolve();
    }),
  };
  const service = createGovernanceService({
    repository,
    authorize,
    authorizeAudit,
    checkpoints,
    clock: () => '2026-11-12T00:00:00Z',
    eventId: () => `event${++ids}`,
    redact: createRedactor(['fixture-secret']),
  });
  return {
    service,
    records,
    session,
    authorize,
    authorizeAudit,
    checkpoints,
    setPolicy: (value: PolicySnapshot | undefined) => {
      current = value;
    },
  };
}
describe('TC-SF5-IDENTITY-012 append audit and independent chain', () => {
  it('redacts before persistence, detects edits/deletions/truncation against independent evidence', async () => {
    const s = setup();
    for (let i = 0; i < 3; i++) await s.service.policy(context);
    expect(await s.service.verifyAudit(context)).toBe(true);
    const head = (await s.checkpoints.load())!;
    expect(verifyAuditChain(s.records, head)).toBe(true);
    const edit = structuredClone(s.records);
    edit[0]!.event.action = 'tampered';
    expect(verifyAuditChain(edit, head)).toBe(false);
    expect(verifyAuditChain(s.records.slice(1), head)).toBe(false);
    expect(verifyAuditChain(s.records.slice(0, -1), head)).toBe(false);
    expect(verifyAuditChain(s.records, { ...head, orgId: 'other' })).toBe(false);
    expect(await setup().service.verifyAudit(context)).toBe(false);
    const audit: AuditEvent = {
      version: 1,
      eventId: 'direct',
      actor,
      action: 'work.read',
      objectType: 'work',
      objectId: 'work',
      occurredAt: '2026-11-12T00:00:00Z',
      outcome: 'allowed',
      details: {
        token: 'fixture-secret',
        message: 'contains fixture-secret postgres://sample:db-pass@localhost/db token=raw-token',
      },
    };
    await s.service.audit(audit);
    expect(JSON.stringify(s.records)).not.toMatch(/fixture-secret|db-pass|raw-token/);
    s.authorizeAudit.mockResolvedValue(false);
    await expect(s.service.audit({ ...audit, eventId: 'blocked' })).rejects.toThrow('denied');
  });
  it('consumes audit envelopes transactionally and repairs checkpoint publication on redelivery', async () => {
    const s = setup();
    const payload: AuditEvent = {
      version: 1,
      eventId: 'outbox',
      actor,
      action: 'work.read',
      objectType: 'work',
      objectId: 'work',
      occurredAt: '2026-11-12T00:00:00Z',
      outcome: 'allowed',
      details: {},
    };
    const envelope = {
      version: 1 as const,
      eventId: payload.eventId,
      orgId: actor.orgId,
      topic: 'governance.audit.requested',
      payload: jsonValueSchema.parse(payload),
      occurredAt: payload.occurredAt,
    };
    expect(await s.service.consumeAudit(envelope)).toMatchObject({ eventId: 'outbox', sequence: 1 });
    expect(s.session.consume).toHaveBeenCalledWith('outbox', expect.any(Function));
    s.session.consume = vi.fn<GovernanceSession['consume']>().mockResolvedValue(false);
    s.session.appendAudit = vi.fn<GovernanceSession['appendAudit']>().mockResolvedValue(s.records[0]!);
    expect(await s.service.consumeAudit(envelope)).toMatchObject({ sequence: 1 });
    for (const change of [
      { topic: 'other' },
      { orgId: 'other' },
      { eventId: 'other' },
      { occurredAt: '2026-11-13T00:00:00Z' },
      { version: 2 },
    ])
      await expect(s.service.consumeAudit({ ...envelope, ...change } as typeof envelope)).rejects.toThrow('denied');
    s.authorizeAudit.mockResolvedValue(false);
    await expect(s.service.consumeAudit(envelope)).rejects.toThrow('denied');
  });
  it('audits and authorizes queries and cannot return data when either sink fails', async () => {
    const s = setup(),
      read = vi.fn<() => Promise<string>>().mockResolvedValue('data');
    expect(await s.service.sensitiveRead(input, read)).toBe('data');
    expect(s.records).toHaveLength(1);
    expect(await s.service.queryAudit(context)).toHaveLength(2);
    expect(s.authorize).toHaveBeenCalledWith({ ...context, permission: 'audit.view' });
    s.session.appendAudit = vi.fn().mockRejectedValue(new Error('fixture-secret'));
    await expect(s.service.sensitiveRead(input, read)).rejects.toThrow('audit unavailable');
    expect(read).toHaveBeenCalledTimes(1);
    const t = setup();
    t.checkpoints.publish.mockRejectedValue(new Error('fixture-secret'));
    await expect(t.service.sensitiveRead(input, read)).rejects.toThrow('audit unavailable');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
describe('TC-SF5-IDENTITY-013 current permissions and constrained sensitive access', () => {
  it('records denials, rechecks explicit revocation, and evaluates latest policy on every call', async () => {
    const s = setup(),
      read = vi.fn();
    s.authorize.mockResolvedValue(false);
    await expect(s.service.sensitiveRead(input, read)).rejects.toThrow('denied');
    expect(s.records[0]?.event.outcome).toBe('denied');
    s.authorize.mockResolvedValue(true);
    s.setPolicy({ ...policy, constraints: { ...policy.constraints, excludedChannels: ['model'] } });
    await expect(s.service.sensitiveRead(input, read)).rejects.toThrow('denied');
    expect(s.records.at(-1)?.event).toMatchObject({
      objectType: 'work',
      objectId: 'work',
      outcome: 'denied',
      details: { policyVersion: 'v1', reasons: ['channel-excluded'], estimatedCost: 1 },
    });
    expect(await s.service.evaluate(input)).toMatchObject({ allowed: false, reasons: ['channel-excluded'] });
    s.setPolicy(policy);
    s.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(s.service.sensitiveRead(input, read)).rejects.toThrow('denied');
    expect(read).not.toHaveBeenCalled();
    s.setPolicy(undefined);
    await expect(s.service.policy(context)).rejects.toThrow('denied');
    s.setPolicy({ ...policy, orgId: 'other' });
    await expect(s.service.policy(context)).rejects.toThrow('denied');
  });
  it('publishes only with separate currently authorized human proposer and confirmer', async () => {
    const s = setup(),
      proposer = {
        ...actor,
        actorId: 'proposer',
        authorizationId: 'proposal-authorization',
        traceId: 'proposal-trace',
      };
    await s.service.publishPolicy(context, proposer, policy);
    expect(s.session.publishPolicy).toHaveBeenCalledWith(policy);
    expect(s.records.at(-1)?.event).toMatchObject({
      action: 'governance.policy.published',
      actor,
      details: {
        policyId: policy.id,
        policyVersion: policy.policyVersion,
        proposer: { actorId: 'proposer', authorizationId: 'proposal-authorization', traceId: 'proposal-trace' },
      },
    });
    expect(s.authorize).toHaveBeenCalledWith({ ...context, actor: proposer, permission: 'policy.propose' });
    expect(s.authorize).toHaveBeenCalledWith({ ...context, permission: 'policy.confirm' });
    for (const invalid of [actor, { ...proposer, actorKind: 'agent' as const }, { ...proposer, orgId: 'other' }])
      await expect(s.service.publishPolicy(context, invalid, policy)).rejects.toThrow('denied');
    await expect(
      s.service.publishPolicy({ ...context, actor: { ...actor, actorKind: 'agent' } }, proposer, policy),
    ).rejects.toThrow('denied');
    await expect(s.service.publishPolicy(context, proposer, { ...policy, orgId: 'other' })).rejects.toThrow('denied');
    s.authorize.mockResolvedValue(false);
    await expect(s.service.publishPolicy(context, proposer, policy)).rejects.toThrow('denied');
  });
  it('requires budget.manage and audits initial/removed constraint denial after releasing a single transaction slot', async () => {
    const s = setup(),
      proposer = { ...actor, actorId: 'proposer' };
    const capped = {
      ...policy,
      constraints: {
        ...policy.constraints,
        budgets: [{ scope: 'organization', scopeId: 'org', remaining: 10, hardLimit: 10 }],
      },
    };
    s.setPolicy(undefined);
    s.authorize.mockImplementation((request) => Promise.resolve(request.permission !== 'budget.manage'));
    await expect(s.service.publishPolicy(context, proposer, capped)).rejects.toThrow('denied');
    expect(s.session.publishPolicy).not.toHaveBeenCalled();
    expect(s.records.at(-1)?.event).toMatchObject({ action: 'budget.manage', outcome: 'denied' });
    s.authorize.mockResolvedValue(true);
    await s.service.publishPolicy(context, proposer, capped);
    expect(s.authorize).toHaveBeenCalledWith({ ...context, permission: 'budget.manage' });
    s.authorize.mockImplementation((request) => Promise.resolve(request.permission !== 'budget.manage'));
    await expect(s.service.publishPolicy(context, proposer, policy)).rejects.toThrow('denied');
    s.authorize.mockResolvedValue(true);
    s.session.publishPolicy.mockRejectedValue(new Error('fixture-secret'));
    const count = s.records.length;
    await expect(s.service.publishPolicy(context, proposer, capped)).rejects.toThrow('Governance operation failed');
    expect(s.records).toHaveLength(count);
  });
  it('never exposes adapter error credentials and supports trusted subscription selection', async () => {
    const s = setup();
    s.authorize.mockRejectedValue(new Error('fixture-secret'));
    await expect(s.service.evaluate(input)).rejects.toThrow('Governance operation failed');
    s.authorize.mockResolvedValue(true);
    s.session.policy = vi.fn().mockRejectedValue(new Error('fixture-secret'));
    await expect(s.service.policy(context)).rejects.toThrow('Governance operation failed');
    const trusted = createGovernanceService({
      repository: {
        transaction: async (_org, _actor, work) => work({ ...s.session, policy: () => Promise.resolve(policy) }),
        outbox: vi.fn(),
      },
      authorize: () => Promise.resolve(true),
      authorizeAudit: () => Promise.resolve(true),
      checkpoints: s.checkpoints,
      clock: () => '2026-11-12T00:00:00Z',
      eventId: () => 'subscription',
      redact: createRedactor(),
      personalSubscription: () => Promise.resolve(true),
    });
    expect(await trusted.evaluate(input)).toMatchObject({ allowed: true, estimatedCost: 0 });
  });
  it('redacts nested diagnostic fields and error messages before returning or logging', () => {
    const redact = createRedactor(['fixture-secret', '']);
    const log = vi.fn();
    const diagnostics = safeDiagnostics(redact, log);
    diagnostics.log({
      authorizationId: 'auth-record',
      nested: [{ password: 'anything', text: 'Bearer abc fixture-secret' }, null, 1, true],
    });
    expect(log.mock.calls[0]?.[0]).toHaveProperty('authorizationId', 'auth-record');
    expect(redact({ Authorization: 'Bearer abc', authorizationId: 'auth-record' })).toEqual({
      Authorization: '[REDACTED]',
      authorizationId: 'auth-record',
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/anything|fixture-secret|Bearer abc/);
    expect(diagnostics.error(new Error('fixture-secret'))).toEqual({ message: '[REDACTED]' });
    expect(diagnostics.error('fixture-secret')).toEqual({ message: '[REDACTED]' });
    expect(createRedactor()('plain')).toBe('plain');
    const ordinaryError =
      'postgres://dbuser:db-pass@localhost/db password="spaced value" token=abc&next=1 api_key=xyz; safe=ok';
    expect(createRedactor()(ordinaryError)).toBe(
      'postgres://[REDACTED]@localhost/db password=[REDACTED] token=[REDACTED]&next=1 api_key=[REDACTED]; safe=ok',
    );
    diagnostics.log({ message: ordinaryError, authorizationId: 'auth-record', traceId: 'trace-record' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/db-pass|spaced value|token=abc|api_key=xyz/);
    expect(diagnostics.error(new Error(ordinaryError))).toEqual({ message: createRedactor()(ordinaryError) });
  });
});
