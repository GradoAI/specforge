import type pg from 'pg';
import { createServiceFactory } from '@fasrun/backend-plugin-api';
import { createEventForwarder, type EventForwarderOptions } from '@fasrun/backend-defaults';
import { isId, newId } from '@fasrun/contracts-core';
import { governanceServiceRef } from '@fasrun/plugin-governance-node';
import { createGovernanceService, type GovernanceDependencies } from '../application/governance.js';
import { createRedactor, safeDiagnostics } from '../application/redaction.js';
import { createGovernanceRepository } from '../infrastructure/repository.js';

export interface GovernanceServicesOptions extends Omit<
  GovernanceDependencies,
  'repository' | 'redact' | 'clock' | 'eventId'
> {
  /** Non-owner application pool bound to governance storage, never a requesting plugin's database. */
  pool: pg.Pool;
  secretValues?: readonly string[];
  clock?: () => string;
  eventId?: () => string;
}

/** Explicit composition for T020. No database, credentials, authorization or checkpoint fallbacks. */
export function createGovernanceServices(options: GovernanceServicesOptions) {
  const repository = createGovernanceRepository(options.pool);
  const redact = createRedactor(options.secretValues);
  const service = createGovernanceService({
    ...options,
    repository,
    redact,
    clock: options.clock ?? (() => new Date().toISOString()),
    eventId: options.eventId ?? (() => newId('evt')),
  });
  return {
    service,
    factory: createServiceFactory({ service: governanceServiceRef, deps: {}, factory: () => service }),
    /** The host supplies authorized tenant membership; this adapter never enumerates other schemas.
     * Register the other plugins' ports for this tenant before start, and stop before closing the pool.
     */
    createTenantForwarder(orgId: string, forwarding: EventForwarderOptions) {
      if (!isId('org', orgId)) throw new Error('Invalid forwarding organization');
      const forwarder = createEventForwarder({
        ...forwarding,
        onError: (error) => forwarding.onError(safeDiagnostics(redact, () => {}).error(error)),
      });
      forwarder.register(repository.outbox(orgId));
      forwarder.registerConsumer({
        id: 'governance.audit',
        topic: 'governance.audit.requested',
        async consume(event) {
          if (event.orgId !== orgId) throw new Error('Forwarded event organization mismatch');
          await service.consumeAudit(event);
        },
      });
      return forwarder;
    },
  };
}
