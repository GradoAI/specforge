import { describe, expect, it } from 'vitest';
import { projectContextSchema } from './control-plane.js';
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
  projectId: 'project-1',
  repositoryId: 'repository-1',
  baseCommit: 'base',
  configRef: ref,
  workflowVersion: 'wf-1',
  templateVersion: 'tpl-1',
  policyVersion: 'policy-1',
};
describe('TC-SF5-CONTRACT-001 knowledge wire contracts', () => {
  it('round-trips through JSON and rejects unknown fields and unsupported versions', () => {
    expect(projectContextSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    for (const invalid of [
      { ...value, version: 2 },
      { ...value, databaseRow: {} },
    ])
      expect(projectContextSchema.safeParse(invalid).success).toBe(false);
  });
});
