// Test backend (SF-1 T009, D-14).
// TC-PLATFORM-032 — R-platform-010.S1: the test backend runs a plugin with a mock logger that records its logs.
import {
  coreServices,
  createBackendModule,
  createBackendPlugin,
  createExtensionPoint,
} from '@fasrun/backend-plugin-api';
import { ErrorCodes } from '@fasrun/contracts-core';
import { describe, expect, it } from 'vitest';
import { mockServices } from './mock-services.js';
import { startTestBackend } from './test-backend.js';

const greeter = createBackendPlugin({
  pluginId: 'greeter',
  register(env) {
    env.registerInit({
      deps: { logger: coreServices.logger, router: coreServices.httpRouter, config: coreServices.rootConfig },
      init: ({ logger, router, config }) =>
        router.use((app) => {
          app.get('/hello', (_request, reply) => {
            logger.info('said hello', { to: config.get('NAME') });
            return reply.send({ hello: config.get('NAME') });
          });
          return Promise.resolve();
        }),
    });
  },
});

describe('startTestBackend (R-platform-010)', () => {
  it('TC-PLATFORM-032 a plugin runs with a mock logger, and the mock records what the plugin logs', async () => {
    const { logger, factories } = mockServices.logger();
    const backend = await startTestBackend({
      features: [greeter],
      services: [...factories, mockServices.rootConfig({ NAME: 'Lin Xia' })],
    });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/greeter/v1/hello' });
      expect(response.json()).toEqual({ hello: 'Lin Xia' });
      expect(logger.entries).toEqual([
        { level: 'info', message: 'said hello', fields: { plugin: 'greeter', to: 'Lin Xia' } },
      ]);
    } finally {
      await backend.stop();
    }
  });

  it('names the missing service when a plugin needs one without a factory', async () => {
    const needsDatabase = createBackendPlugin({
      pluginId: 'store',
      register: (env) => env.registerInit({ deps: { db: coreServices.database }, init: () => undefined }),
    });
    await expect(startTestBackend({ features: [needsDatabase] })).rejects.toMatchObject({
      code: ErrorCodes.SERVICE_NOT_IMPLEMENTED,
      details: { pluginId: 'store', serviceId: 'core.database' },
    });
  });

  it('initialises modules before their plugin and passes extension points', async () => {
    const order: string[] = [];
    const point = createExtensionPoint<{ add(name: string): void }>({ id: 'work.checks' });
    const names: string[] = [];
    const backend = await startTestBackend({
      features: [
        createBackendPlugin({
          pluginId: 'work',
          register(env) {
            env.registerExtensionPoint(point, { add: (name) => void names.push(name) });
            env.registerInit({ deps: {}, init: () => void order.push(`plugin:${names.join(',')}`) });
          },
        }),
        createBackendModule({
          pluginId: 'work',
          moduleId: 'lint',
          register: (env) =>
            env.registerInit({ deps: { point }, init: ({ point: p }) => void (p.add('lint'), order.push('module')) }),
        }),
      ],
    });
    await backend.stop();
    expect(order).toEqual(['module', 'plugin:lint']);
  });
});
