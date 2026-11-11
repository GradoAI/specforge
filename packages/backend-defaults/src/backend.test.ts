// Backend plugin framework (SF-1 T006, D-4).
// TC-PLATFORM-016 — R-platform-005.S1: a plugin receives the default services it declares, in isolated containers.
// TC-PLATFORM-017 — R-platform-005.S2: depending on an unimplemented service fails startup with code, plugin and service.
import { Writable } from 'node:stream';
import {
  coreServices,
  createBackendModule,
  createBackendPlugin,
  createExtensionPoint,
  createServiceFactory,
  createServiceRef,
  type DatabaseService,
  type LoggerService,
  type RootConfigService,
} from '@fasrun/backend-plugin-api';
import { ErrorCodes, isFasrunError } from '@fasrun/contracts-core';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBackend, type Backend } from './backend.js';
import { runBackend } from './run.js';

// No connection is opened: pg connects on the first query, and these tests never query.
const ENV = { FASRUN_CORE_DATABASE_URL: 'postgres://fasrun@127.0.0.1:5432/fasrun_test', FASRUN_CORE_PORT: '8080' };

function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  return { logger: pino({ level: 'debug' }, stream), lines };
}

const backends: Backend[] = [];
function backendFor(options: Partial<Parameters<typeof createBackend>[0]> = {}) {
  const backend = createBackend({ component: 'core', env: ENV, logger: captureLogger().logger, ...options });
  backends.push(backend);
  return backend;
}
afterEach(async () => {
  await Promise.all(backends.splice(0).map((b) => b.stop().catch(() => undefined)));
});

interface Received {
  config: RootConfigService;
  logger: LoggerService;
  database: DatabaseService;
}

const pluginReceiving = (pluginId: string, sink: Map<string, Received>) =>
  createBackendPlugin({
    pluginId,
    register(env) {
      env.registerInit({
        deps: { config: coreServices.rootConfig, logger: coreServices.logger, database: coreServices.database },
        init: (deps) => void sink.set(pluginId, deps),
      });
    },
  });

describe('backend plugin framework (R-platform-005)', () => {
  it('TC-PLATFORM-016 a plugin receives config, logger and database, and each plugin has its own container', async () => {
    const { logger, lines } = captureLogger();
    const received = new Map<string, Received>();
    const backend = backendFor({ logger });
    backend.add(pluginReceiving('identity', received));
    backend.add(pluginReceiving('work-items', received));
    await backend.start();

    const identity = received.get('identity');
    const work = received.get('work-items');
    expect(identity && work).toBeTruthy();
    if (!identity || !work) return;
    // Root service: one shared instance.
    expect(identity.config).toBe(work.config);
    expect(identity.config.get('PORT')).toBe('8080');
    expect(identity.config.parse(z.object({ PORT: z.coerce.number() }))).toEqual({ PORT: 8080 });
    // Plugin services: separate instances bound to each plugin.
    expect(identity.logger).not.toBe(work.logger);
    expect(identity.database).not.toBe(work.database);
    expect(identity.database.schema).toBe('identity');
    expect(work.database.schema).toBe('work_items');
    expect(typeof identity.database.db.execute).toBe('function');
    identity.logger.info('hello', { step: 1 });
    expect(lines).toContainEqual(expect.objectContaining({ plugin: 'identity', msg: 'hello', step: 1 }));
  });

  it('TC-PLATFORM-017 depending on an unimplemented service stops startup with the code, plugin and service', async () => {
    let initialised = false;
    const backend = backendFor();
    backend.add(
      createBackendPlugin({
        pluginId: 'knowledge',
        register(env) {
          env.registerInit({
            deps: { logger: coreServices.logger, secrets: coreServices.secrets },
            init: () => void (initialised = true),
          });
        },
      }),
    );
    const error: unknown = await backend.start().catch((e: unknown) => e);
    expect(isFasrunError(error, ErrorCodes.SERVICE_NOT_IMPLEMENTED)).toBe(true);
    expect(error).toMatchObject({ details: { pluginId: 'knowledge', serviceId: 'core.secrets' } });
    expect(initialised).toBe(false);
  });

  it('TC-PLATFORM-017 the host helper logs the code, plugin and service and sets a non-zero exit code', async () => {
    const { logger, lines } = captureLogger();
    const backend = backendFor({ logger });
    backend.add(
      createBackendPlugin({
        pluginId: 'knowledge',
        register: (env) => env.registerInit({ deps: { audit: coreServices.audit }, init: () => undefined }),
      }),
    );
    const previous = process.exitCode;
    try {
      expect(await runBackend(backend, logger)).toBe(false);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previous;
    }
    expect(lines).toContainEqual(
      expect.objectContaining({
        code: 'FASRUN_SERVICE_NOT_IMPLEMENTED',
        pluginId: 'knowledge',
        serviceId: 'core.audit',
      }),
    );
  });

  it('reports a missing transitive dependency of a custom service', async () => {
    const report = createServiceRef<{ send(): void }>({ id: 'test.report' });
    const backend = backendFor({
      services: [
        createServiceFactory({
          service: report,
          deps: { events: coreServices.events },
          factory: () => ({ send() {} }),
        }),
      ],
    });
    backend.add(
      createBackendPlugin({
        pluginId: 'insight',
        register: (env) => env.registerInit({ deps: { report }, init: () => undefined }),
      }),
    );
    await expect(backend.start()).rejects.toMatchObject({
      code: ErrorCodes.SERVICE_NOT_IMPLEMENTED,
      details: { pluginId: 'insight', serviceId: 'core.events', via: ['test.report'] },
    });
  });

  it('mounts plugin routes under /api/<plugin>/v1', async () => {
    const backend = backendFor();
    backend.add(
      createBackendPlugin({
        pluginId: 'work',
        register(env) {
          env.registerInit({
            deps: { router: coreServices.httpRouter },
            init: ({ router }) =>
              router.use((app) => {
                app.get('/items', (_request, reply) => reply.send({ items: [] }));
                return Promise.resolve();
              }),
          });
        },
      }),
    );
    await backend.start();
    const response = await backend.server.inject({ method: 'GET', url: '/api/work/v1/items' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [] });
    expect((await backend.server.inject({ method: 'GET', url: '/items' })).statusCode).toBe(404);
  });

  it('initialises modules before their plugin and hands them the plugin extension points', async () => {
    const order: string[] = [];
    const checks = createExtensionPoint<{ add(name: string): void }>({ id: 'work.checks' });
    const backend = backendFor();
    backend.add(
      createBackendModule({
        pluginId: 'work',
        moduleId: 'lint',
        register: (env) =>
          env.registerInit({
            deps: { checks },
            init: ({ checks: point }) => {
              point.add('lint');
              order.push('module');
            },
          }),
      }),
    );
    const names: string[] = [];
    backend.add(
      createBackendPlugin({
        pluginId: 'work',
        register(env) {
          env.registerExtensionPoint(checks, { add: (name) => void names.push(name) });
          env.registerInit({ deps: {}, init: () => void order.push(`plugin:${names.join(',')}`) });
        },
      }),
    );
    await backend.start();
    expect(order).toEqual(['module', 'plugin:lint']);
  });

  it('rejects duplicate plugins and modules for plugins that are not added', async () => {
    const backend = backendFor();
    const plugin = createBackendPlugin({ pluginId: 'work', register: () => undefined });
    backend.add(plugin);
    expect(() => backend.add(plugin)).toThrow(/added twice/);
    const orphan = backendFor();
    orphan.add(createBackendModule({ pluginId: 'missing', moduleId: 'x', register: () => undefined }));
    await expect(orphan.start()).rejects.toMatchObject({ code: ErrorCodes.FEATURE_CONFLICT });
  });

  it('fails with FASRUN_CONFIG_INVALID when the database is requested without a connection string', async () => {
    const backend = backendFor({ env: {} });
    backend.add(pluginReceiving('identity', new Map()));
    await expect(backend.start()).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
      details: { variable: 'FASRUN_CORE_DATABASE_URL' },
    });
  });
});
