import type pg from 'pg';
import { createActionRepository } from '../infrastructure/actions/repository.js';
import { createActionState } from '../application/actions/service.js';
export function createConnectActionState(
  options: Omit<Parameters<typeof createActionState>[0], 'repository'> & { pool: pg.Pool; leaseMs?: number },
) {
  if (!options.pool || !options.authority || !options.audit) throw new Error('Action state dependencies missing');
  return createActionState({ ...options, repository: createActionRepository(options.pool, options.leaseMs) });
}
