import { expect, it, vi } from 'vitest';
import type { OperationContext } from '@fasrun/contracts-core';
import { createEnvironmentService, type EnvironmentDependencies } from './snapshot.js';
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: 'member',
    actorKind: 'member',
    orgId: 'org',
    clientId: 'test',
    source: 'internal',
    traceId: 'trace',
  },
  scope: { orgId: 'org' },
  permission: 'environment.read',
  object: { type: 'template', id: 'default' },
};
it('TC-SF5-SPEC-008 reads only the explicitly selected authorized environment version', async () => {
  const load = vi.fn(() =>
    Promise.resolve({
      version: 1 as const,
      orgId: 'org',
      templateId: 'default',
      templateVersion: '1',
      allowedCapabilities: ['test'],
    }),
  );
  const authorize = vi.fn(() => Promise.resolve(true));
  const service = createEnvironmentService({
    load,
    authorize,
    audit: { audit: (event) => Promise.resolve({ eventId: event.eventId, sequence: 1, hash: 'a'.repeat(64) }) },
  });
  expect(
    (await service.snapshot(context, { templateId: 'default', templateVersion: '1' })).allowedCapabilities,
  ).toEqual(['test']);
  await expect(service.snapshot(context, { templateId: '', templateVersion: '1' })).rejects.toThrow('Explicit');
  await expect(service.snapshot(context, { templateId: 'default', templateVersion: '2' })).rejects.toThrow('mismatch');
  await expect(
    service.snapshot(
      { ...context, actor: { ...context.actor, orgId: 'other' }, scope: { orgId: 'other' } },
      { templateId: 'default', templateVersion: '1' },
    ),
  ).rejects.toThrow('mismatch');
  authorize.mockResolvedValue(false);
  await expect(service.snapshot(context, { templateId: 'default', templateVersion: '1' })).rejects.toThrow('denied');
});

it('TC-SF5-SPEC-008 fails closed before storage when audit persistence fails', async () => {
  const load = vi.fn(() => Promise.resolve(undefined));
  const service = createEnvironmentService({
    load,
    authorize: () => Promise.resolve(true),
    audit: { audit: () => Promise.reject(new Error('postgres://user:secret@private/db')) },
  });
  await expect(service.snapshot(context, { templateId: 'default', templateVersion: '1' })).rejects.toThrow(
    'invalid or unavailable',
  );
  expect(load).not.toHaveBeenCalled();
});

it('TC-SF5-SPEC-008 authorizes the actual requested template on initial and final checks', async () => {
  const request = { templateId: 'allowed', templateVersion: '1' };
  const load = vi.fn<EnvironmentDependencies['load']>(() =>
    Promise.resolve({ version: 1, orgId: 'org', ...request, allowedCapabilities: [] }),
  );
  const authorize = vi.fn<EnvironmentDependencies['authorize']>((_context, target) =>
    Promise.resolve(target.templateId === 'allowed' && target.templateVersion === '1'),
  );
  const audit = vi.fn<EnvironmentDependencies['audit']['audit']>((event) =>
    Promise.resolve({ eventId: event.eventId, sequence: 1, hash: 'a'.repeat(64) }),
  );
  const service = createEnvironmentService({ load, authorize, audit: { audit } });
  await expect(service.snapshot(context, { templateId: 'other', templateVersion: '1' })).rejects.toThrow('denied');
  expect(load).not.toHaveBeenCalled();
  expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'denied', objectId: 'other@1' }));
  await service.snapshot(context, request);
  expect(authorize).toHaveBeenNthCalledWith(2, context, request);
  expect(authorize).toHaveBeenNthCalledWith(3, context, request);
  authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(service.snapshot(context, request)).rejects.toThrow('denied');
  expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'denied', objectId: 'allowed@1' }));
});
