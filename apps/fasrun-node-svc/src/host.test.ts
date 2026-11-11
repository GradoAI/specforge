// FASRUN-NODE-SVC host (SF-1 T007, D-5).
// TC-PLATFORM-015 — R-platform-004.S6: ready once initialisation finishes; no database is configured.
import { coreServices, createBackendPlugin } from '@fasrun/backend-plugin-api';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { createNodeHost } from './host.js';

describe('fasrun-node-svc (R-platform-004)', () => {
  it('TC-PLATFORM-015 /readyz and /healthz return 200 after the plugins are assembled', async () => {
    let initialised = false;
    const host = createNodeHost({
      env: {},
      logger: pino({ level: 'silent' }),
      plugins: [
        createBackendPlugin({
          pluginId: 'execution',
          register: (env) =>
            env.registerInit({ deps: { logger: coreServices.logger }, init: () => void (initialised = true) }),
        }),
      ],
    });
    try {
      const server = host.backend.server;
      await host.backend.start();
      expect(initialised).toBe(true);
      expect((await server.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
      expect((await server.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    } finally {
      await host.stop();
    }
  });

  it('is not ready before initialisation finishes', async () => {
    const host = createNodeHost({ env: {}, logger: pino({ level: 'silent' }) });
    // Fastify serves injected requests after ready(); readiness itself is still false.
    await host.backend.server.ready();
    expect((await host.backend.server.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503);
    await host.backend.server.close();
  });
});
