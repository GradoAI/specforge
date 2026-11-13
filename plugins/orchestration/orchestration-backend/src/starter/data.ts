import type pg from 'pg';
import { createContentAddressedStorage } from '@fasrun/backend-defaults';
import { createDataRepository } from '../infrastructure/data/repository.js';
import { createDataService } from '../application/data/service.js';
import type { DataDependencies } from '../application/data/ports.js';
/** T020 binds real owner-scoped identity/governance/resolver adapters here. Default status host stays inert. */
export async function createDataServices(
  options: Omit<DataDependencies, 'repository' | 'storage'> & {
    pool: pg.Pool;
    contentDirectory: string;
  },
) {
  const repository = createDataRepository(options.pool);
  const storage = await createContentAddressedStorage(options.contentDirectory);
  return {
    service: createDataService({ ...options, repository, storage }),
    outbox: (orgId: string) => repository.outbox(orgId),
  };
}
