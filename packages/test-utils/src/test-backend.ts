// In-memory test backend (SF-1 D-14): a small Fastify + Awilix host that assembles plugins with mock services.
// It does not use backend-defaults, which is AGPL-3.0 (R-platform-016.S3).
import type {
  AnyServiceRef,
  BackendFeature,
  ExtensionPoint,
  InitRegistration,
  ServiceFactory,
} from '@fasrun/backend-plugin-api';
import { ErrorCodes, FasrunError } from '@fasrun/contracts-core';
import { asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import { httpRouterFactories, mockServices, type CollectedRoutes } from './mock-services.js';

export interface StartTestBackendOptions {
  features: readonly BackendFeature[];
  /** Factories that replace the defaults (mock config, mock logger and the HTTP router). */
  services?: readonly ServiceFactory[];
}

export interface TestBackend {
  /** Fastify instance with the plugin routes mounted; use `server.inject()` to call them. */
  readonly server: FastifyInstance;
  stop(): Promise<void>;
}

type AnyDep = AnyServiceRef | ExtensionPoint<unknown>;
const isExtensionPoint = (dep: AnyDep): dep is ExtensionPoint<unknown> => dep.$$type === '@fasrun/ExtensionPoint';

export async function startTestBackend(options: StartTestBackendOptions): Promise<TestBackend> {
  const routes = new Map<string, CollectedRoutes>();
  const pools: pg.Pool[] = [];
  const factories = new Map<string, ServiceFactory>();
  for (const factory of [
    mockServices.rootConfig(),
    ...mockServices.logger().factories,
    httpRouterFactories(routes),
    ...(options.services ?? []),
  ]) {
    factories.set(factory.service.id, factory);
  }
  const root = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });
  const scopes = new Map<string, AwilixContainer>();

  async function resolve(ref: AnyServiceRef, pluginId: string): Promise<unknown> {
    let container = root;
    if (ref.scope === 'plugin') {
      container = scopes.get(pluginId) ?? root.createScope();
      scopes.set(pluginId, container);
    }
    if (container.registrations[ref.id]) return container.resolve(ref.id);
    const factory = factories.get(ref.id);
    if (!factory) {
      throw new FasrunError(
        ErrorCodes.SERVICE_NOT_IMPLEMENTED,
        `Plugin "${pluginId}" depends on service "${ref.id}", which the test backend does not provide; pass a factory in services`,
        { pluginId, serviceId: ref.id },
      );
    }
    const deps: Record<string, unknown> = {};
    for (const [name, dep] of Object.entries(factory.deps)) deps[name] = await resolve(dep, pluginId);
    const instance = await factory.factory(deps, ref.scope === 'root' ? {} : { pluginId });
    container.register(ref.id, asValue(instance));
    return instance;
  }

  // Pools created by a database factory are closed in stop().
  const database = factories.get('core.database');
  if (database) {
    const original = database;
    factories.set('core.database', {
      ...original,
      factory: async (deps, context) => {
        const service = await original.factory(deps, context);
        const pool = (service as { db: { $client?: pg.Pool } }).db.$client;
        if (pool) pools.push(pool);
        return service;
      },
    });
  }

  const inits: { pluginId: string; registration: InitRegistration<Record<string, AnyDep>> }[] = [];
  const extensionPoints = new Map<string, unknown>();
  const plugins = options.features.filter((f) => f.kind === 'plugin');
  for (const plugin of plugins) {
    plugin.register({
      registerInit: (registration) =>
        void inits.push({
          pluginId: plugin.pluginId,
          registration: registration,
        }),
      registerExtensionPoint: (point, implementation) => void extensionPoints.set(point.id, implementation),
    });
  }
  // Modules initialise before their plugin, as in the real backend.
  for (const module of options.features.filter((f) => f.kind === 'module')) {
    module.register({
      registerInit: (registration) =>
        void inits.unshift({
          pluginId: module.pluginId,
          registration: registration,
        }),
    });
  }

  for (const { pluginId, registration } of inits) {
    const resolved: Record<string, unknown> = {};
    for (const [name, dep] of Object.entries(registration.deps)) {
      resolved[name] = isExtensionPoint(dep) ? extensionPoints.get(dep.id) : await resolve(dep, pluginId);
    }
    await registration.init(resolved);
  }

  const server = Fastify({ logger: false });
  for (const { pluginId, routes: list } of routes.values()) {
    if (list.length === 0) continue;
    await server.register(
      async (instance) => {
        for (const plugin of list) await instance.register(plugin);
      },
      { prefix: `/api/${pluginId}/v1` },
    );
  }
  await server.ready();
  return {
    server,
    async stop() {
      await server.close();
      await Promise.all(pools.map((pool) => pool.end()));
      await root.dispose();
    },
  };
}
