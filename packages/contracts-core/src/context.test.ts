import { describe, expect, it } from 'vitest';
import {
  actorContextSchema,
  operationContextSchema,
  protectedReadSchema,
  problemSchema,
  jsonValueSchema,
  dataReferenceSchema,
} from './context.js';
const actor = {
  version: 1,
  actorId: 'member-1',
  actorKind: 'member',
  orgId: 'org-1',
  clientId: 'cli',
  source: 'http',
  traceId: 'trace-1',
};
const context = { actor, permission: 'data.read', scope: { orgId: 'org-1' }, object: { type: 'work', id: 'work-1' } };
const ref = {
  version: 1,
  id: `ref://orchestration/data/ref-1@${'a'.repeat(64)}`,
  orgId: 'org-1',
  ownerPlugin: 'orchestration',
  versionHash: 'a'.repeat(64),
  labels: {
    trust: 'untrusted',
    source: { kind: 'agent', id: 'draft-agent' },
    readScopes: [{ orgId: 'org-1' }],
    classification: 'internal',
    excludedChannels: ['github'],
  },
};
describe('TC-SF5-CONTRACT-001 shared context boundary', () => {
  it('round-trips identity, operation and reference labels as JSON', () => {
    const input = { context, ref };
    expect(protectedReadSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });
  it('rejects absent identity, unknown fields, versions and tenant mismatch', () => {
    for (const value of [undefined, {}, { ...actor, version: 2 }, { ...actor, administrator: true }])
      expect(actorContextSchema.safeParse(value).success).toBe(false);
    expect(operationContextSchema.safeParse({ ...context, scope: { orgId: 'org-2' } }).success).toBe(false);
    for (const value of [
      ref.id,
      { ref },
      { context, ref: { ...ref, orgId: 'org-2' } },
      { context, ref: { ...ref, labels: { ...ref.labels, trust: 'approved' } } },
    ])
      expect(protectedReadSchema.safeParse(value).success).toBe(false);
  });
  it('serializes public errors without stack or credentials and excludes executable/non-JSON data', () => {
    const error = {
      version: 1,
      type: 'https://fasrun.dev/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'identity.forbidden',
      traceId: 'trace-1',
    };
    expect(problemSchema.parse(JSON.parse(JSON.stringify(error)))).toEqual(error);
    for (const value of [
      { ...error, stack: 'secret' },
      { ...error, status: 200 },
      { ...error, version: 2 },
      { ...error, code: 'arbitrary code' },
    ])
      expect(problemSchema.safeParse(value).success).toBe(false);
    for (const value of [new Date(), () => true, undefined, Infinity, 1n])
      expect(jsonValueSchema.safeParse(value).success).toBe(false);
  });
  it('retains source, read scope and confirmation provenance in versioned references', () => {
    const confirmed = {
      ...ref,
      id: `ref://orchestration/data/ref-1@${'b'.repeat(64)}`,
      versionHash: 'b'.repeat(64),
      labels: {
        ...ref.labels,
        trust: 'confirmed',
        confirmation: {
          kind: 'human',
          memberId: 'member-1',
          basis: 'review-1',
          originalRef: ref.id,
          headCommit: 'approved-head',
        },
      },
    };
    expect(dataReferenceSchema.parse(JSON.parse(JSON.stringify(confirmed)))).toEqual(confirmed);
    for (const invalid of [
      { ...ref, id: 'ref-1' },
      { ...ref, ownerPlugin: 'identity' },
      { ...ref, versionHash: 'b'.repeat(64) },
      { ...ref, labels: { ...ref.labels, source: undefined } },
      { ...ref, labels: { ...ref.labels, readScopes: [] } },
      { ...ref, labels: { ...ref.labels, readScopes: [{ orgId: 'other' }] } },
      { ...confirmed, labels: { ...confirmed.labels, confirmation: undefined } },
      { ...ref, labels: { ...ref.labels, confirmation: confirmed.labels.confirmation } },
    ])
      expect(dataReferenceSchema.safeParse(invalid).success).toBe(false);
    expect(ref.labels.trust).toBe('untrusted');
  });
});
