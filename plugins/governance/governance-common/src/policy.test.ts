import { describe, expect, it } from 'vitest';
import type { DataReference } from '@fasrun/contracts-core';
import { evaluatePolicy, scopeContains, type PolicyEvaluation } from './policy.js';
import type { PolicySnapshot } from './control-plane.js';
const actor = {
  version: 1,
  actorId: 'member',
  actorKind: 'member',
  orgId: 'org',
  clientId: 'cli',
  source: 'http',
  traceId: 'trace',
} as const;
const input: PolicyEvaluation = {
  context: {
    actor,
    permission: 'work.view',
    scope: { orgId: 'org', teamId: 'team', projectId: 'project' },
    object: { type: 'work', id: 'work' },
  },
  facts: {},
  estimatedUnitCost: 3,
  retryLimit: 2,
  references: [],
  channel: 'model',
};
const snapshot: PolicySnapshot = {
  version: 1,
  id: 'policy',
  orgId: 'org',
  policyVersion: 'v1',
  constraints: { budgets: [], allowedReadScopes: [{ orgId: 'org' }], excludedChannels: [] },
};
describe('TC-SF5-GOVERNANCE-002 current policy decisions', () => {
  it('charges every attempt against all applicable scopes; trusted subscriptions alone exempt amount', () => {
    for (const [scope, scopeId] of [
      ['organization', 'org'],
      ['team', 'team'],
      ['project', 'project'],
      ['member', 'member'],
    ] as const) {
      const policy = {
        ...snapshot,
        constraints: { ...snapshot.constraints, budgets: [{ scope, scopeId, remaining: 8, hardLimit: 100 }] },
      };
      expect(evaluatePolicy(policy, input)).toMatchObject({
        allowed: false,
        estimatedCost: 9,
        reasons: [`budget-${scope}-exceeded`],
      });
      expect(evaluatePolicy(policy, input, true).allowed).toBe(true);
      expect(
        evaluatePolicy(
          {
            ...policy,
            constraints: { ...policy.constraints, budgets: [{ scope, scopeId, remaining: 100, hardLimit: 8 }] },
          },
          input,
        ).allowed,
      ).toBe(false);
    }
    expect(evaluatePolicy(snapshot, input).allowed).toBe(true);
    expect(
      evaluatePolicy(
        {
          ...snapshot,
          constraints: {
            ...snapshot.constraints,
            budgets: [{ scope: 'member', scopeId: 'other', remaining: 0, hardLimit: 0 }],
          },
        },
        input,
      ).allowed,
    ).toBe(true);
    for (const change of [
      { estimatedUnitCost: -1 },
      { estimatedUnitCost: Infinity },
      { retryLimit: -1 },
      { retryLimit: 0.5 },
      { estimatedUnitCost: Number.MAX_VALUE },
    ])
      expect(evaluatePolicy(snapshot, { ...input, ...change }).reasons).toContain('invalid-cost-estimate');
  });
  it('fails closed for invalid policy, missing condition facts, tenant, scope and excluded channels', () => {
    expect(evaluatePolicy({ ...snapshot, constraints: {} }, input).reasons).toContain('invalid-policy');
    expect(evaluatePolicy({ ...snapshot, orgId: 'other' }, input).reasons).toContain('organization-mismatch');
    const condition = { must: [{ condition: 'sender_is_bot', params: {} }] };
    const policy = { ...snapshot, constraints: { ...snapshot.constraints, condition } };
    expect(evaluatePolicy(policy, input).reasons).toContain('invalid-condition-context');
    expect(evaluatePolicy(policy, { ...input, facts: { senderIsBot: false } }).reasons).toContain(
      'condition-not-matched',
    );
    expect(evaluatePolicy(policy, { ...input, facts: { senderIsBot: true } }).allowed).toBe(true);
    expect(
      evaluatePolicy(
        { ...snapshot, constraints: { ...snapshot.constraints, allowedReadScopes: [], excludedChannels: ['model'] } },
        input,
      ).reasons,
    ).toEqual(['scope-denied', 'channel-excluded']);
    const ref = {
      orgId: 'org',
      labels: { readScopes: [{ orgId: 'org' }], excludedChannels: [] },
    } as unknown as DataReference;
    expect(evaluatePolicy(snapshot, { ...input, references: [ref] }).allowed).toBe(true);
    expect(evaluatePolicy(snapshot, { ...input, references: [{ ...ref, orgId: 'other' }] }).reasons).toContain(
      'reference-scope-denied',
    );
    expect(
      evaluatePolicy(snapshot, {
        ...input,
        references: [{ ...ref, labels: { ...ref.labels, readScopes: [], excludedChannels: ['model'] } }],
      }).reasons,
    ).toEqual(['reference-scope-denied', 'reference-channel-excluded']);
    expect(scopeContains({ orgId: 'org', teamId: 'team', projectId: 'project' }, input.context.scope)).toBe(true);
    expect(scopeContains({ orgId: 'org', teamId: 'other' }, input.context.scope)).toBe(false);
    expect(scopeContains({ orgId: 'org', projectId: 'other' }, input.context.scope)).toBe(false);
  });
});
