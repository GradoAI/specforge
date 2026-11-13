import { createServiceRef, createExtensionPoint } from '@fasrun/backend-plugin-api';
import type { ActorContext, OperationContext } from '@fasrun/contracts-core';
import type {
  Decision,
  Authorization,
  IdentityRequest,
  Member,
  EffectivePermission,
} from '@fasrun/plugin-identity-common';

export interface IdentityService {
  beginLogin(orgId: string): Promise<{ url: string; browserCookie: string }>;
  completeLogin(input: {
    state: string;
    browserCookie: string;
    code: string;
    request: IdentityRequest;
  }): Promise<{ actor: ActorContext; csrf: string; cookie: string }>;
  authenticateSession(
    sessionToken: string,
    request: IdentityRequest & { method: string; origin?: string; csrf?: string },
  ): Promise<ActorContext>;
  logout(context: OperationContext, sessionToken: string): Promise<void>;
  effectivePermissions(context: OperationContext): Promise<EffectivePermission[]>;
  authenticateContext(credential: string, request: IdentityRequest): Promise<ActorContext>;
  resolveMembers(context: OperationContext, memberIds: string[]): Promise<Pick<Member, 'id' | 'orgId' | 'active'>[]>;
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
