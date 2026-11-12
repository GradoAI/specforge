import { describe, expect, it } from 'vitest';
import { inboxEventSchema } from './control-plane.js';
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
  orgId: 'org-1',
  installationId: 'install-1',
  deliveryId: 'delivery-1',
  externalObjectId: 'issue-1',
  eventType: 'issues.opened',
  receivedAt: '2026-11-12T00:00:00Z',
  signatureVerified: true,
  payloadRef: ref,
};
describe('TC-SF5-CONTRACT-001 connect wire contracts', () => {
  it('round-trips through JSON and rejects unknown fields and unsupported versions', () => {
    expect(inboxEventSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    for (const invalid of [
      { ...value, version: 2 },
      { ...value, databaseRow: {} },
    ])
      expect(inboxEventSchema.safeParse(invalid).success).toBe(false);
  });
});
