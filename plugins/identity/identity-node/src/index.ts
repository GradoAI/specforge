import { createServiceRef, createExtensionPoint } from '@fasrun/backend-plugin-api';
import type { ActorContext, OperationContext } from '@fasrun/contracts-core';
import type { Decision, Authorization } from '@fasrun/plugin-identity-common';

export interface IdentityService {
  authenticateContext(
    credential: string,
    request: { clientId: string; source: ActorContext['source']; traceId: string },
  ): Promise<ActorContext>;
  authorize(context: OperationContext): Promise<Decision>;
  issueAuthorization(
    context: OperationContext,
    request: { intakeId: string; requestStrength: Authorization['requestStrength'] },
  ): Promise<Authorization>;
  revoke(
    context: OperationContext,
    request: { authorizationId: string; reason: string; idempotencyKey: string },
  ): Promise<void>;
}
export interface IdentityProvider {
  readonly id: string;
  authenticate(credential: string): Promise<{ issuer: string; subject: string }>;
}
export interface IdentityProviders {
  register(provider: IdentityProvider): void;
}
export const identityProviders = createExtensionPoint<IdentityProviders>({ id: 'identity.providers' });

/** Owner-bound root facade; its factory binds identity's repository, never the caller's schema. */
export const identityServiceRef = createServiceRef<IdentityService>({ id: 'identity.service', scope: 'root' });
