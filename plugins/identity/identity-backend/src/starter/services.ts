import type pg from 'pg';
import { createServiceFactory } from '@fasrun/backend-plugin-api';
import { identityServiceRef } from '@fasrun/plugin-identity-node';
import { createIdentityService, type IdentityDependencies } from '../application/identity.js';
import { createIdentityRepository } from '../infrastructure/repository.js';
import { createKeycloakProvider, type KeycloakOptions } from '../infrastructure/auth/keycloak.js';
export function createIdentityServices(
  options: Omit<IdentityDependencies, 'repository' | 'provider'> & { pool: pg.Pool; oidc: KeycloakOptions },
) {
  const repository = createIdentityRepository(options.pool),
    service = createIdentityService({ ...options, repository, provider: createKeycloakProvider(options.oidc) });
  return {
    service,
    factory: createServiceFactory({ service: identityServiceRef, deps: {}, factory: () => service }),
    outbox: (orgId: string) => repository.outbox(orgId),
  };
}
