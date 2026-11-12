import { describe, expect, it } from 'vitest';
import { auditEventSchema } from './control-plane.js';
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
  eventId: 'event-1',
  actor,
  action: 'data.read',
  objectType: 'work',
  objectId: 'work-1',
  occurredAt: '2026-11-12T00:00:00Z',
  outcome: 'allowed',
  details: { source: 'http' },
};
describe('TC-SF5-CONTRACT-001 governance wire contracts', () => {
  it('round-trips through JSON and rejects unknown fields and unsupported versions', () => {
    expect(auditEventSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    for (const invalid of [
      { ...value, version: 2 },
      { ...value, databaseRow: {} },
    ])
      expect(auditEventSchema.safeParse(invalid).success).toBe(false);
  });
});
