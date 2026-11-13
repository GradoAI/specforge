import { expect, it } from 'vitest';
import {
  assertArchiveApproval,
  encodeArchiveOperation,
  requireArchiveContext,
  type ArchiveOperation,
} from './index.js';
const context = {
  actor: {
    version: 1 as const,
    actorId: 'actor',
    actorKind: 'agent' as const,
    orgId: 'org',
    clientId: 'host',
    source: 'workflow' as const,
    traceId: 'trace',
    authorizationId: 'record',
  },
  scope: { orgId: 'org', projectId: 'project' },
  permission: 'spec.write',
  object: { type: 'change', id: 'change' },
};
const operation: ArchiveOperation = {
  version: 1,
  binding: {
    repositoryId: 'repo',
    repositoryRoot: '/repo',
    specRoot: 'fasrun',
    change: 'changes/demo',
    date: '2026-11-13',
  },
  inputs: [
    { kind: 'directory', path: 'changes/demo' },
    { kind: 'file', path: 'changes/demo/bytes.bin', bytes: 'AP8=' },
  ],
  actions: [
    { kind: 'write', path: 'specs/demo/spec.md', text: 'full text' },
    { kind: 'move', from: 'changes/demo', to: 'changes/archive/2026-11-13-demo' },
  ],
};
it('TC-SF5-SPEC-009 exact encoding preserves content, binary attachments, move and action order', () => {
  const encoded = encodeArchiveOperation(operation);
  expect(JSON.parse(encoded)).toEqual(operation);
  expect(encodeArchiveOperation({ ...operation, actions: [...operation.actions].reverse() })).not.toBe(encoded);
  expect(() => encodeArchiveOperation({ ...operation, extra: true } as never)).toThrow();
  expect(() =>
    encodeArchiveOperation({ ...operation, actions: [{ kind: 'write', path: '../escape', text: 'bad' }] }),
  ).toThrow();
});
it('TC-SF5-SPEC-009 requires an existing scoped authorization and an exact trusted projection', () => {
  const hash = 'a'.repeat(64);
  const approval = { authorizationId: 'record', context, operationDigest: hash };
  expect(() => assertArchiveApproval(context, hash, approval)).not.toThrow();
  for (const bad of [
    undefined,
    true,
    {},
    { ...approval, authorizationId: 'other' },
    { ...approval, operationDigest: 'b'.repeat(64) },
    { ...approval, context: { ...context, permission: 'other' } },
  ])
    expect(() => assertArchiveApproval(context, hash, bad)).toThrow();
  expect(() =>
    requireArchiveContext({ ...context, actor: { ...context.actor, authorizationId: undefined } }),
  ).toThrow();
  expect(() => requireArchiveContext({ ...context, scope: { orgId: 'org' } })).toThrow();
  expect(() => requireArchiveContext({ ...context, actor: { ...context.actor, actorKind: 'system' } })).toThrow();
});
