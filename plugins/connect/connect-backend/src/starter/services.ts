import { createServiceFactory } from '@fasrun/backend-plugin-api';
import { connectStateServiceRef } from '@fasrun/plugin-connect-node';
import { createCredentialCipher, type MasterKeySource } from '../infrastructure/encryption.js';
import type pg from 'pg';
import { createConnectState, type ConnectStateDependencies } from '../application/state.js';
import { createConnectGateway as gateway } from '../application/gateway.js';
import { createConnectRepository } from '../infrastructure/repository.js';
/** CORE alone receives a database. Gateway construction has no database parameter or repository dependency. */
export function createConnectCore(options: Omit<ConnectStateDependencies, 'repository'> & { pool: pg.Pool }) {
  if (!options.pool || !options.authority || !options.audit) throw new Error('CORE state dependencies missing');
  const repository = createConnectRepository(options.pool);
  const service = createConnectState({ ...options, repository });
  return {
    service,
    factory: createServiceFactory({ service: connectStateServiceRef, deps: {}, factory: () => service }),
    outbox: (orgId: string) => repository.outbox(orgId),
  };
}
export function createConnectGateway(
  options: Omit<Parameters<typeof gateway>[0], 'cipher'> & { keys: MasterKeySource },
) {
  if (!options.keys || typeof options.keys.activeVersion !== 'function' || typeof options.keys.key !== 'function')
    throw new Error('Gateway key dependencies missing');
  return gateway({ ...options, cipher: createCredentialCipher(options.keys) });
}
