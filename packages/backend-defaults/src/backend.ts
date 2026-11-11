// Backend assembly (SF-1 D-4): a Fastify 5 server, an Awilix root container for root services and one
// child scope per plugin, so plugin-scoped services are created and cached separately for each plugin.
import type {
  AnyServiceRef,
  BackendFeature,
  BackendModule,
  BackendPlugin,
  ExtensionPoint,
  InitRegistration,
  ServiceFactory,
} from '@fasrun/backend-plugin-api';
import { ErrorCodes, FasrunError } from '@fasrun/contracts-core';
import { asValue, createContainer, InjectionMode, type AwilixContainer } from 'awilix';
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { pino, type Logger } from 'pino';
import { createRootConfig, defaultServiceFactories, httpRoutesRef, rootDatabasePoolRef, wrapPino } from './services.js';

export interface CreateBackendOptions {
  /** Component name, e.g. "core"; configuration is read from FASRUN_<COMPONENT>_* variables. */
  component: string;
  /** Environment to read configuration from; defaults to process.env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Root pino logger; defaults to JSON on stdout with the component name. */
  logger?: Logger;
  /** Additional or replacement service factories (later ones win over the defaults). */
  services?: readonly ServiceFactory[];
}

export interface Backend {
  readonly server: FastifyInstance;
  add(feature: BackendFeature): void;
  /** Validates dependencies, initialises every module and plugin, and mounts their routes. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

type AnyDep = AnyServiceRef | ExtensionPoint<unknown>;
const isExtensionPoint = (dep: AnyDep): dep is ExtensionPoint<unknown> => dep.$$type === '@fasrun/ExtensionPoint';

export function createBackend(options: CreateBackendOptions): Backend {
  const rootLogger = options.logger ?? pino({ base: { component: options.component } });
  const rootConfig = createRootConfig(options.component, options.env ?? process.env);
  const factories = new Map<string, ServiceFactory>();
  for (const factory of [...defaultServiceFactories({ rootConfig, rootLogger }), ...(options.services ?? [])]) {
    factories.set(factory.service.id, factory);
  }
  const server = Fastify({ logger: false });
  const root = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });
  const scopes = new Map<string, AwilixContainer>();
  const plugins = new Map<string, BackendPlugin>();
  const modules: BackendModule[] = [];
  let started = false;

  const conflict = (message: string, details: Record<string, unknown>) =>
    new FasrunError(ErrorCodes.FEATURE_CONFLICT, message, details);

  function scopeOf(pluginId: string): AwilixContainer {
    let scope = scopes.get(pluginId);
    if (!scope) {
      scope = root.createScope();
      scopes.set(pluginId, scope);
    }
    return scope;
  }

  /** Throws FASRUN_SERVICE_NOT_IMPLEMENTED for the first dependency (direct or transitive) without a factory. */
  function assertImplemented(ref: AnyServiceRef, pluginId: string, path: string[] = []): void {
    const factory = factories.get(ref.id);
    if (!factory) {
      throw new FasrunError(
        ErrorCodes.SERVICE_NOT_IMPLEMENTED,
        `Plugin "${pluginId}" depends on service "${ref.id}", which this backend does not implement`,
        { pluginId, serviceId: ref.id, via: path },
      );
    }
    for (const dep of Object.values(factory.deps)) {
      if (path.includes(dep.id)) throw new Error(`Service dependency cycle: ${[...path, ref.id, dep.id].join(' -> ')}`);
      assertImplemented(dep, pluginId, [...path, ref.id]);
    }
  }

  async function resolve(ref: AnyServiceRef, pluginId: string): Promise<unknown> {
    // Plugin-scoped services are only ever registered in plugin scopes, so a hit here is this plugin's own.
    const container = ref.scope === 'root' ? root : scopeOf(pluginId);
    if (container.registrations[ref.id]) return container.resolve(ref.id);
    const factory = factories.get(ref.id);
    if (!factory) throw new Error(`No factory for ${ref.id}`); // already validated
    const deps: Record<string, unknown> = {};
    for (const [name, dep] of Object.entries(factory.deps)) deps[name] = await resolve(dep, pluginId);
    const instance = await factory.factory(deps, ref.scope === 'root' ? {} : { pluginId });
    container.register(ref.id, asValue(instance));
    return instance;
  }

  return {
    server,
    add(feature) {
      if (started) throw new Error('Features must be added before start()');
      if (feature.kind === 'plugin') {
        if (plugins.has(feature.pluginId)) {
          throw conflict(`Plugin "${feature.pluginId}" is added twice`, { pluginId: feature.pluginId });
        }
        plugins.set(feature.pluginId, feature);
      } else {
        if (modules.some((m) => m.pluginId === feature.pluginId && m.moduleId === feature.moduleId)) {
          throw conflict(`Module "${feature.moduleId}" of plugin "${feature.pluginId}" is added twice`, {
            pluginId: feature.pluginId,
            moduleId: feature.moduleId,
          });
        }
        modules.push(feature);
      }
    },

    async start() {
      if (started) throw new Error('start() was already called');
      started = true;
      const pluginInits = new Map<string, InitRegistration<Record<string, AnyServiceRef>>>();
      const extensionPoints = new Map<string, { pluginId: string; implementation: unknown }>();
      for (const plugin of plugins.values()) {
        plugin.register({
          registerInit: (registration) => {
            pluginInits.set(plugin.pluginId, registration);
          },
          registerExtensionPoint: (point, implementation) => {
            if (extensionPoints.has(point.id))
              throw conflict(`Extension point "${point.id}" is registered twice`, { id: point.id });
            extensionPoints.set(point.id, { pluginId: plugin.pluginId, implementation });
          },
        });
      }
      const moduleInits = new Map<BackendModule, InitRegistration<Record<string, AnyDep>>>();
      for (const module of modules) {
        if (!plugins.has(module.pluginId)) {
          throw conflict(`Module "${module.moduleId}" targets plugin "${module.pluginId}", which is not added`, {
            pluginId: module.pluginId,
            moduleId: module.moduleId,
          });
        }
        module.register({
          registerInit: (registration) => {
            moduleInits.set(module, registration);
          },
        });
      }

      // Fail before any init runs if a declared service is missing.
      for (const [pluginId, registration] of pluginInits) {
        for (const dep of Object.values(registration.deps)) assertImplemented(dep, pluginId);
      }
      for (const [module, registration] of moduleInits) {
        for (const dep of Object.values(registration.deps)) {
          if (!isExtensionPoint(dep)) assertImplemented(dep, module.pluginId);
          else if (extensionPoints.get(dep.id)?.pluginId !== module.pluginId) {
            throw conflict(
              `Module "${module.moduleId}" uses extension point "${dep.id}", which plugin "${module.pluginId}" does not offer`,
              {
                pluginId: module.pluginId,
                moduleId: module.moduleId,
                extensionPoint: dep.id,
              },
            );
          }
        }
      }

      const resolveAll = async (deps: Record<string, AnyDep>, pluginId: string) => {
        const resolved: Record<string, unknown> = {};
        for (const [name, dep] of Object.entries(deps)) {
          resolved[name] = isExtensionPoint(dep)
            ? extensionPoints.get(dep.id)?.implementation
            : await resolve(dep, pluginId);
        }
        return resolved;
      };
      // Modules initialise before their plugin so that the plugin sees what they contributed.
      for (const pluginId of plugins.keys()) {
        for (const [module, registration] of moduleInits) {
          if (module.pluginId === pluginId) await registration.init(await resolveAll(registration.deps, pluginId));
        }
        const registration = pluginInits.get(pluginId);
        if (registration) await registration.init(await resolveAll(registration.deps, pluginId));
      }

      for (const [pluginId, scope] of scopes) {
        const collected = scope.registrations[httpRoutesRef.id]
          ? scope.resolve<{ routes: FastifyPluginAsync[] }>(httpRoutesRef.id)
          : undefined;
        if (!collected?.routes.length) continue;
        await server.register(
          async (instance) => {
            for (const routes of collected.routes) await instance.register(routes);
          },
          { prefix: `/api/${pluginId}/v1` },
        );
      }
      await server.ready();
      wrapPino(rootLogger).info('Backend started', { plugins: [...plugins.keys()], modules: modules.length });
    },

    async stop() {
      await server.close();
      if (root.registrations[rootDatabasePoolRef.id]) await root.resolve<pg.Pool>(rootDatabasePoolRef.id).end();
      await root.dispose();
    },
  };
}
