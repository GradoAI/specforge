import { describe, expect, it } from 'vitest';
import type { DataLabels, DataReference } from '@fasrun/contracts-core';
import { canonicalData, derivedLabels, normalizeLabels, referenceVersion } from './data.js';
const labels: DataLabels = {
  source: { kind: 'system', id: 'check' },
  trust: 'untrusted',
  readScopes: [{ orgId: 'org' }],
  classification: 'repository',
  excludedChannels: [],
};
const input = (trust: DataLabels['trust']): DataReference => ({
  version: 1,
  id: `ref://orchestration/data/obj@${'a'.repeat(64)}`,
  ownerPlugin: 'orchestration',
  orgId: 'org',
  versionHash: 'a'.repeat(64),
  labels: { ...labels, trust },
});
describe('TC-CF-014/015 canonical versions and trust propagation', () => {
  it('hashes canonical contents and all labels, but not object key/set ordering', () => {
    expect(canonicalData({ b: 2, a: [null, true, 'data'] })).toBe('{"a":[null,true,"data"],"b":2}');
    const hash = 'a'.repeat(64),
      base = referenceVersion(hash, labels);
    expect(referenceVersion(hash, { ...labels, trust: 'trusted' })).not.toBe(base);
    expect(referenceVersion(hash, { ...labels, source: { kind: 'external', id: 'issue' } })).not.toBe(base);
    expect(referenceVersion(hash, { ...labels, readScopes: [{ orgId: 'org', projectId: 'project' }] })).not.toBe(base);
    expect(referenceVersion(hash, { ...labels, readScopes: [{ orgId: 'org' }, { orgId: 'org' }] })).toBe(base);
    expect(referenceVersion(hash, { ...labels, excludedChannels: ['b', 'a', 'a'] })).toBe(
      referenceVersion(hash, { ...labels, excludedChannels: ['a', 'b'] }),
    );
    expect(() => referenceVersion('bad', labels)).toThrow();
    expect(() => canonicalData(undefined)).toThrow();
    expect(normalizeLabels({ ...labels, readScopes: [{ orgId: 'z' }, { orgId: 'a' }] }).readScopes[0]?.orgId).toBe('a');
  });
  it('does not permit agent/external/check-pass to promote data or strip inherited restrictions', () => {
    expect(derivedLabels(labels, [input('trusted'), input('untrusted')], true).trust).toBe('untrusted');
    expect(derivedLabels(labels, [input('trusted')], false).trust).toBe('untrusted');
    expect(derivedLabels(labels, [input('trusted')], true).trust).toBe('trusted');
    expect(derivedLabels(labels, [], false).trust).toBe('untrusted');
    for (const kind of ['agent', 'external'] as const)
      expect(
        derivedLabels({ ...labels, source: { kind, id: 'source' }, trust: 'trusted' }, [input('trusted')], true).trust,
      ).toBe('untrusted');
    expect(derivedLabels({ ...labels, source: { kind: 'trusted_source', id: 'catalog' } }, [], true).trust).toBe(
      'trusted',
    );
    const restricted = input('untrusted');
    restricted.labels.readScopes = [{ orgId: 'org', teamId: 't', projectId: 'p' }];
    restricted.labels.excludedChannels = ['model'];
    expect(() => derivedLabels(labels, [restricted], false)).toThrow('scope');
    const allowed = { ...labels, readScopes: restricted.labels.readScopes };
    expect(derivedLabels(allowed, [restricted], false).excludedChannels).toEqual(['model']);
    expect(() => derivedLabels({ ...allowed, classification: 'public' }, [restricted], false)).toThrow(
      'classification',
    );
    expect(() =>
      derivedLabels(
        { ...labels, trust: 'confirmed', confirmation: { kind: 'trusted_source', sourceId: 'fake', basis: 'fake' } },
        [],
        true,
      ),
    ).toThrow('Confirmation');
  });
});
