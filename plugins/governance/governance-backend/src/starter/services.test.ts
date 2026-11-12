import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createBackendModule } from '@fasrun/backend-plugin-api';
import { newId } from '@fasrun/contracts-core';
import { governanceServiceRef, outboxes } from '@fasrun/plugin-governance-node';
import { startTestBackend } from '@fasrun/test-utils';
import { createGovernancePlugin } from './plugin.js';
import { createGovernanceServices } from './services.js';

describe('TC-SF5-GOVERNANCE-002 explicit governance composition', () => {
  it('binds an owner service and outbox registry without inheriting the requesting plugin database', async () => {
    const pool = new pg.Pool({ connectionString: 'postgres://unused@127.0.0.1:1/unused' });
    const components = createGovernanceServices({
      pool,
      authorize: () => Promise.resolve(false),
      authorizeAudit: () => Promise.resolve(false),
      checkpoints: {
        load: () => Promise.resolve(undefined),
        publish: () => Promise.reject(new Error('not configured')),
      },
    });
    const forwarder = components.createTenantForwarder(newId('org'), { workerId: 'assembly-test', onError() {} });
    expect(components.factory.service.scope).toBe('root');
    expect(components.factory.deps).toEqual({});
    expect(() => components.createTenantForwarder('../org', { workerId: 'bad', onError() {} })).toThrow();
    let initialized = false;
    const module = createBackendModule({
      pluginId: 'governance',
      moduleId: 'assembly-probe',
      register(env) {
        env.registerInit({
          deps: { service: governanceServiceRef, registry: outboxes },
          init({ service, registry }) {
            expect(service).toBe(components.service);
            expect(registry).toBe(forwarder);
            initialized = true;
          },
        });
      },
    });
    const backend = await startTestBackend({
      features: [createGovernancePlugin(forwarder), module],
      services: [components.factory],
    });
    try {
      expect(initialized).toBe(true);
      expect((await backend.server.inject('/api/governance/v1/status')).statusCode).toBe(200);
      expect(pool.totalCount).toBe(0); // Assembly does not silently open connections or start polling.
    } finally {
      await forwarder.stop();
      await backend.stop();
      await pool.end();
    }
  });
});
