import { describe, expect, it, vi } from 'vitest';
import {
  createAuthenticateCompatibility,
  createProtectedDataRefService,
  contextServices,
  type ContextAuthService,
} from './context-services.js';
import type { ActorContext, ProtectedRead } from '@fasrun/contracts-core';
import { coreServices } from './core-services.js';
const actor: ActorContext = {
  version: 1,
  actorId: 'member-1',
  actorKind: 'member',
  orgId: 'org-1',
  clientId: 'cli',
  source: 'http',
  traceId: 'trace-1',
};
const request: ProtectedRead = {
  context: { actor, permission: 'data.read', scope: { orgId: 'org-1' }, object: { type: 'work', id: 'work-1' } },
  ref: {
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
  },
};
describe('TC-SF5-CONTRACT-001 context-aware service ports', () => {
  it('retains authenticate response shape and propagates authentication failure', async () => {
    const authenticateContext = vi.fn().mockResolvedValue(actor);
    const auth: ContextAuthService = { authenticateContext, authorize: vi.fn() };
    const legacy = createAuthenticateCompatibility(auth, { clientId: 'cli', source: 'http', traceId: 'trace-1' });
    expect(await legacy('credential')).toEqual({ principalId: actor.actorId, orgId: actor.orgId });
    expect(authenticateContext).toHaveBeenCalledWith('credential', {
      clientId: 'cli',
      source: 'http',
      traceId: 'trace-1',
    });
    authenticateContext.mockRejectedValueOnce(new Error('revoked'));
    await expect(legacy('credential')).rejects.toThrow('revoked');
  });
  it('rejects legacy/context-free and cross-tenant reads before calling the resolver', async () => {
    const resolve = vi.fn().mockResolvedValue({ ref: request.ref, value: 'payload' });
    const service = createProtectedDataRefService(resolve);
    // @ts-expect-error A naked reference is no longer a protected read contract.
    await expect(service.read('ref-1')).rejects.toThrow();
    // @ts-expect-error Caller identity cannot be omitted.
    await expect(service.read({ ref: request.ref })).rejects.toThrow();
    await expect(service.read({ ...request, ref: { ...request.ref, orgId: 'another-org' } })).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
    expect(await service.read(request)).toEqual({ ref: request.ref, value: 'payload' });
    resolve.mockRejectedValueOnce(new Error('current authorization revoked'));
    await expect(service.read(request)).rejects.toThrow('revoked');
  });
  it('keeps owner-routed facades root scoped and repositories plugin scoped', () => {
    expect(contextServices.auth.scope).toBe('root');
    expect(contextServices.dataRef.scope).toBe('root');
    expect(coreServices.database.scope).toBe('plugin');
  });
});
