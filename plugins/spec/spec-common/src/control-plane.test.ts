import { describe, expect, it } from 'vitest';
import { layerRevisionSchema } from './control-plane.js';
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
  id: 'revision-1',
  workId: 'work-1',
  layer: 'requirements',
  baseCommit: 'base',
  headCommit: 'head',
  schemaVersion: '1',
  contentRef: ref,
};
describe('TC-SF5-CONTRACT-001 spec wire contracts', () => {
  it('round-trips through JSON and rejects unknown fields and unsupported versions', () => {
    expect(layerRevisionSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    for (const invalid of [
      { ...value, version: 2 },
      { ...value, databaseRow: {} },
    ])
      expect(layerRevisionSchema.safeParse(invalid).success).toBe(false);
  });
});
