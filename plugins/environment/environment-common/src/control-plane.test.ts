import { describe, expect, it } from 'vitest';
import { environmentSnapshotSchema } from './control-plane.js';
const value = {
  version: 1,
  orgId: 'org-1',
  templateId: 'template-1',
  templateVersion: 'v1',
  allowedCapabilities: ['spec.draft'],
};
describe('TC-SF5-CONTRACT-001 environment wire contracts', () => {
  it('round-trips through JSON and rejects unknown fields and unsupported versions', () => {
    expect(environmentSnapshotSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    for (const invalid of [
      { ...value, version: 2 },
      { ...value, databaseRow: {} },
    ])
      expect(environmentSnapshotSchema.safeParse(invalid).success).toBe(false);
  });
});
