import { describe, expect, it } from 'vitest';
import { authorizationSchema } from './control-plane.js';
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
const value = {
  version: 1,
  id: 'auth-1',
  intakeId: 'intake-1',
  actor,
  scope: { orgId: 'org-1' },
  requestStrength: 'explicit',
  ruleIds: ['rule-1'],
  policyVersion: 'policy-1',
};
describe('TC-SF5-CONTRACT-001 identity wire contracts', () => {
  it('round-trips through JSON and rejects unknown fields and unsupported versions', () => {
    expect(authorizationSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    for (const invalid of [
      { ...value, version: 2 },
      { ...value, databaseRow: {} },
    ])
      expect(authorizationSchema.safeParse(invalid).success).toBe(false);
  });
});
