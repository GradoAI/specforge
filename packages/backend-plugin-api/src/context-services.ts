import {
  protectedReadSchema,
  type ActorContext,
  type OperationContext,
  type ProtectedRead,
  type JsonValue,
  type DataReference,
} from '@fasrun/contracts-core';
import { createServiceRef } from './services.js';

export interface ContextAuthService {
  authenticateContext(
    credential: string,
    request: { clientId: string; source: ActorContext['source']; traceId: string },
  ): Promise<ActorContext>;
  authorize(
    context: OperationContext,
  ): Promise<{ allowed: boolean; matchedRuleIds: readonly string[]; policyVersion: string; reason: string }>;
}
/** Keeps the M0 authenticate response while resolving identity through the context-aware implementation. */
export function createAuthenticateCompatibility(
  service: ContextAuthService,
  request: { clientId: string; source: ActorContext['source']; traceId: string },
) {
  return async (credential: string): Promise<{ principalId: string; orgId: string }> => {
    const actor = await service.authenticateContext(credential, request);
    return { principalId: actor.actorId, orgId: actor.orgId };
  };
}
export interface ProtectedDataRefService {
  read(request: ProtectedRead): Promise<{ ref: DataReference; value: JsonValue }>;
}
/** Validate before invoking storage. Current permission, revocation and audit checks remain mandatory in the resolver. */
export function createProtectedDataRefService(resolve: ProtectedDataRefService['read']): ProtectedDataRefService {
  return { read: async (request) => resolve(protectedReadSchema.parse(request)) };
}
/** Owner supplies claim/ack against its own transaction/schema; consumers never receive a database handle. */
export interface OutboxEvent {
  version: 1;
  eventId: string;
  orgId: string;
  topic: string;
  payload: JsonValue;
  occurredAt: string;
}
export interface ClaimedEvent {
  event: OutboxEvent;
  leaseToken: string;
}
export interface OutboxPort {
  readonly ownerPlugin: string;
  claim(request: { workerId: string; limit: number; leaseUntil: string }): Promise<readonly ClaimedEvent[]>;
  ack(request: { eventId: string; leaseToken: string }): Promise<void>;
  retry(request: { eventId: string; leaseToken: string; retryAt: string }): Promise<void>;
}
export interface OutboxRegistry {
  register(port: OutboxPort): void;
}
/** Root ports route to explicitly owner-bound repositories; never inject a caller-scoped database into another plugin. */
export const contextServices = {
  auth: createServiceRef<ContextAuthService>({ id: 'core.contextAuth', scope: 'root' }),
  dataRef: createServiceRef<ProtectedDataRefService>({ id: 'core.protectedDataRef', scope: 'root' }),
};
