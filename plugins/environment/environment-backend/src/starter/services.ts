import type pg from 'pg';
import { createServiceFactory } from '@fasrun/backend-plugin-api';
import { environmentServiceRef } from '@fasrun/plugin-environment-node';
import { createEnvironmentService, type EnvironmentDependencies } from '../application/snapshot.js';
import { createEnvironmentRepository } from '../infrastructure/repository.js';
export function createEnvironmentServices(
  options: Pick<EnvironmentDependencies, 'authorize' | 'audit' | 'clock'> & { pool: pg.Pool },
) {
  const service = createEnvironmentService({
    ...options,
    ...createEnvironmentRepository(options.pool),
  });
  return {
    service,
    factory: createServiceFactory({ service: environmentServiceRef, deps: {}, factory: () => service }),
  };
}
