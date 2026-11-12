import { describe, expect, it } from 'vitest';
import { agentCallSchema, agentResultSchema } from './control-plane.js';
const actor = {
  version: 1,
  actorId: 'member-1',
  actorKind: 'member',
  orgId: 'org-1',
  clientId: 'cli',
  source: 'http',
  traceId: 'trace-1',
  authorizationId: 'auth-1',
};
const ref = {
  version: 1,
  id: `ref://spec/data/ref-1@${'a'.repeat(64)}`,
  orgId: 'org-1',
  ownerPlugin: 'spec',
  versionHash: 'a'.repeat(64),
  labels: {
    trust: 'untrusted',
    source: { kind: 'agent', id: 'draft-agent' },
    readScopes: [{ orgId: 'org-1' }],
    classification: 'internal',
    excludedChannels: [],
  },
};
const value = {
  version: 1,
  callId: 'call-1',
  orgId: 'org-1',
  workId: 'work-1',
  stepRunId: 'step-1',
  attempt: 1,
  authorizationId: 'auth-1',
  actor,
  inputRefs: [ref],
  allowedReadScopes: [{ orgId: 'org-1' }],
  allowedWriteScopes: [],
  outputSchemaVersion: 'draft-v1',
  deadline: '2026-11-12T12:00:00Z',
  implementationId: 'fixture-v1',
};
describe('TC-SF5-CONTRACT-001 orchestration wire contracts', () => {
  it('round-trips through JSON and rejects unknown fields and unsupported versions', () => {
    expect(agentCallSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    for (const invalid of [
      { ...value, version: 2 },
      { ...value, databaseRow: {} },
    ])
      expect(agentCallSchema.safeParse(invalid).success).toBe(false);
  });
  it('rejects mismatched authorization/tenant, stale shapes and arbitrary control fields', () => {
    for (const invalid of [
      { ...value, attempt: 0 },
      { ...value, authorizationId: 'different' },
      { ...value, orgId: 'other' },
      { ...value, allowedWriteScopes: [{ orgId: 'other' }] },
    ])
      expect(agentCallSchema.safeParse(invalid).success).toBe(false);
    const result = {
      version: 1,
      callId: 'call-1',
      attempt: 1,
      implementationId: 'fixture-v1',
      status: 'success',
      outputRefs: [ref],
      output: { text: 'untrusted draft' },
      replanRequested: false,
    };
    expect(agentResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    for (const invalid of [
      { ...result, plan: { approved: true } },
      { ...result, status: 'approved' },
      { ...result, replanRequested: 'yes' },
      { ...result, output: () => true },
    ])
      expect(agentResultSchema.safeParse(invalid).success).toBe(false);
    expect(
      agentResultSchema.parse({
        version: 1,
        callId: 'call-1',
        attempt: 1,
        implementationId: 'fixture-v1',
        status: 'cancelled',
        reason: 'cancelled by actor',
      }).status,
    ).toBe('cancelled');
  });
});
