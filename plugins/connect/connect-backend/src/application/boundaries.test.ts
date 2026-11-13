import { createCredentialCipher } from '../infrastructure/encryption.js';
import { createConnectGateway as gatewayApplication } from './gateway.js';
import { it, expect } from 'vitest';
import type { OperationContext } from '@fasrun/contracts-core';
import type { ConnectRepository } from '../common/ports.js';
import { createConnectState } from './state.js';
import { createConnectGateway, createConnectCore } from '../starter/services.js';
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: 'manager',
    actorKind: 'member',
    orgId: 'org',
    clientId: 'test',
    source: 'internal',
    traceId: 't',
  },
  permission: 'untrusted.permission',
  scope: { orgId: 'org', projectId: 'A' },
  object: { type: 'repository', id: 'A' },
};
it('TC-SF5-CONNECT-002 actual target overrides claimed permission/scope and read audit failure returns no data', async () => {
  const requested: OperationContext[] = [];
  let auditFails = false,
    exists = true,
    active = true,
    saved = false;
  const repository = {
    integration: () =>
      Promise.resolve(
        exists ? { id: 'integration', orgId: 'org', installationId: 'install', provider: 'github', active } : undefined,
      ),
    binding: () =>
      Promise.resolve({
        id: 'binding',
        integrationId: 'integration',
        repositoryId: 'B',
        scope: { orgId: 'org', teamId: 'team', projectId: 'B' },
        active,
      }),
    saveObject: () => {
      saved = true;
      return Promise.resolve();
    },
    credential: () => Promise.resolve(undefined),
  } as unknown as ConnectRepository;
  const service = createConnectState({
    repository,
    authority: {
      authorize: (actual) => {
        requested.push(actual);
        return Promise.resolve(actual.permission === 'integration.manage' && actual.scope.projectId === 'B');
      },
    },
    audit: {
      audit: (e) =>
        auditFails
          ? Promise.reject(new Error('secret audit error'))
          : Promise.resolve({ eventId: e.eventId, sequence: 1, hash: 'a'.repeat(64) }),
    },
  });
  const object = {
    id: 'object',
    integrationId: 'integration',
    repositoryId: 'B',
    externalId: 'issue',
    kind: 'issue' as const,
    observedAt: new Date().toISOString(),
    digest: 'a'.repeat(64),
  };
  await service.observe(context, object);
  expect(saved).toBe(true);
  expect(requested[0]).toMatchObject({
    permission: 'integration.manage',
    scope: { projectId: 'B' },
    object: { id: 'B' },
  });
  exists = false;
  await expect(service.observe(context, object)).rejects.toThrow('unavailable');
  exists = true;
  active = false;
  await expect(service.observe(context, object)).rejects.toThrow('unavailable');
  active = true;
  await expect(
    service.configure(
      context,
      { id: 'integration', orgId: 'other', installationId: 'install', provider: 'github', active: true },
      {
        id: 'binding',
        integrationId: 'integration',
        repositoryId: 'B',
        scope: { orgId: 'org', teamId: 'team', projectId: 'B' },
        active: true,
      },
    ),
  ).rejects.toThrow('rejected');
  auditFails = true;
  await expect(service.credential(context, 'integration')).rejects.toThrow('unavailable');
  expect(() => createConnectCore({} as Parameters<typeof createConnectCore>[0])).toThrow('dependencies');
});
it('TC-SF5-CONNECT-005 gateway refuses unverified or non-durable replies and disallows management before provider probing', async () => {
  let validated = false;
  const core = {
    accept: () => Promise.reject(new Error('database error')),
    credential: () => Promise.reject(new Error('secret error')),
    storeCredential: () => Promise.resolve(),
  };
  const gateway = createConnectGateway({
    core,
    keys: { activeVersion: () => 'v', key: () => Buffer.alloc(32) },
    authorize: (actual) => {
      expect(actual.object).toEqual({ type: 'integration', id: 'integration' });
      expect(actual.scope).toEqual({ orgId: 'org' });
      expect(actual.permission).toBe('integration.manage');
      return Promise.resolve(false);
    },
    validateCredential: () => {
      validated = true;
      return Promise.resolve();
    },
    verify: () => Promise.reject(new Error('invalid signature')),
  });
  await expect(gateway.receive(Buffer.from('untrusted'), {})).rejects.toThrow('unavailable');
  await expect(gateway.rotate(context, 'integration', 'v1', Buffer.from('secret'), null)).rejects.toThrow(
    'unavailable',
  );
  expect(validated).toBe(false);
  await expect(gateway.useCredential(context, 'integration', () => Promise.resolve('unused'))).rejects.toThrow(
    'unavailable',
  );
});
it('TC-SF5-CONNECT-003 absent integration/credential and cross-tenant envelope fail closed', async () => {
  let exists = false;
  const repository = {
    integration: () =>
      Promise.resolve(
        exists
          ? { id: 'integration', orgId: 'org', installationId: 'install', provider: 'github', active: true }
          : undefined,
      ),
    credential: () => Promise.resolve(undefined),
  } as unknown as ConnectRepository;
  const service = createConnectState({
    repository,
    authority: { authorize: () => Promise.resolve(true) },
    audit: { audit: (e) => Promise.resolve({ eventId: e.eventId, sequence: 1, hash: 'a'.repeat(64) }) },
  });
  const envelope = createCredentialCipher({ activeVersion: () => 'v', key: () => Buffer.alloc(32) }).encrypt(
    'org',
    'integration',
    '1',
    Buffer.from('fixture'),
  );
  await expect(service.storeCredential(context, envelope, null)).rejects.toThrow('unavailable');
  await expect(service.credential(context, 'integration')).rejects.toThrow('unavailable');
  exists = true;
  await expect(service.credential(context, 'integration')).rejects.toThrow('unavailable');
  await expect(service.storeCredential(context, { ...envelope, orgId: 'other' }, null)).rejects.toThrow('unavailable');
  expect(() => gatewayApplication({} as Parameters<typeof gatewayApplication>[0])).toThrow('dependencies');
  expect(() => createConnectGateway({} as Parameters<typeof createConnectGateway>[0])).toThrow('dependencies');
});
