import type { GovernanceService } from '@fasrun/plugin-governance-node';
import { operationContextSchema, newId, type OperationContext } from '@fasrun/contracts-core';
import type { IdentityService } from '@fasrun/plugin-identity-node';
import type { ConnectAuthority } from '../common/ports.js';
/** No private CONNECT permission names: internal operation names map to the existing matrix point. */
export function createConnectAuthority(identity: Pick<IdentityService, 'authorize'>): ConnectAuthority {
  return {
    authorize: async (context) => (await identity.authorize({ ...context, permission: 'integration.manage' })).allowed,
  };
}
export interface InternalTarget {
  operation: 'accept' | 'storeCredential' | 'credential';
  id: string;
  installationId?: string;
}
/** Configured by the trusted host, never by request bodies. A service can act only for its configured
 * integration manager and exact installed repository scope. No autonomous service-account lifecycle. */
export function createManagedContextResolver(options: {
  identity: Pick<IdentityService, 'authorize'>;
  audit: Pick<GovernanceService, 'audit'>;
  binding(peer: string, target: InternalTarget): Promise<OperationContext>;
}) {
  return async (peer: string, requested: OperationContext, target: InternalTarget): Promise<OperationContext> => {
    const bound = operationContextSchema.parse(await options.binding(peer, target));
    if (
      bound.actor.actorKind !== 'member' ||
      bound.actor.orgId !== requested.actor.orgId ||
      bound.actor.actorId !== requested.actor.actorId ||
      bound.object.id !== target.id ||
      bound.object.type !== (target.operation === 'accept' ? 'repository' : 'integration')
    ) {
      await options.audit.audit({
        version: 1,
        eventId: newId('evt'),
        actor: { ...bound.actor, source: 'internal', clientId: peer },
        action: 'connect.internal.denied',
        objectType: bound.object.type,
        objectId: bound.object.id,
        occurredAt: new Date().toISOString(),
        outcome: 'denied',
        details: { reason: 'configured-binding-mismatch' },
      });
      throw new Error('Configured management identity mismatch');
    }
    const actual = {
      ...bound,
      actor: { ...bound.actor, source: 'internal' as const, clientId: peer },
      permission: 'integration.manage',
    };
    if (!(await options.identity.authorize(actual)).allowed) throw new Error('Current management authorization denied');
    return actual;
  };
}
