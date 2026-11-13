// Mock implementations of the default services (SF-1 D-14). Each helper returns a service factory that
// startTestBackend uses instead of its default.
import {
  coreServices,
  createServiceFactory,
  type DatabaseService,
  type HttpRouterService,
  type LogFields,
  type LoggerService,
  type RootConfigService,
  type ServiceFactory,
} from '@fasrun/backend-plugin-api';
import { ErrorCodes, FasrunError } from '@fasrun/contracts-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyPluginAsync } from 'fastify';
import pg from 'pg';
import { managePool } from './pool-lifecycle.js';

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields: LogFields;
}

/** A logger that keeps every entry in memory; plugin loggers add a `plugin` field like the real one. */
export interface MockLogger extends LoggerService {
  readonly entries: LogEntry[];
}

function mockLogger(entries: LogEntry[], bound: LogFields = {}): MockLogger {
  const write =
    (level: LogEntry['level']) =>
    (message: string, fields: LogFields = {}): void => {
      entries.push({ level, message, fields: { ...bound, ...fields } });
    };
  return {
    entries,
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (fields) => mockLogger(entries, { ...bound, ...fields }),
  };
}

function rootConfig(values: Readonly<Record<string, string>>): RootConfigService {
  return {
    component: 'TEST',
    get: (name) => values[name],
    getRequired(name) {
      const value = values[name];
      if (!value) throw new FasrunError(ErrorCodes.CONFIG_INVALID, `Missing test configuration ${name}`, { name });
      return value;
    },
    parse: (schema) => schema.parse(values),
  };
}

/** Routes collected per plugin, mounted by the test backend under /api/<plugin>/v1. */
export interface CollectedRoutes {
  pluginId: string;
  routes: FastifyPluginAsync[];
}

export const mockServices = {
  /** Configuration values keyed without the FASRUN_<COMPONENT>_ prefix. */
  rootConfig(values: Readonly<Record<string, string>> = {}): ServiceFactory {
    return createServiceFactory({ service: coreServices.rootConfig, deps: {}, factory: () => rootConfig(values) });
  },

  /** Logger whose entries can be asserted; pass the returned `logger` to read them. */
  logger(): { logger: MockLogger; factories: ServiceFactory[] } {
    const logger = mockLogger([]);
    return {
      logger,
      factories: [
        createServiceFactory({ service: coreServices.rootLogger, deps: {}, factory: () => logger }),
        createServiceFactory({
          service: coreServices.logger,
          deps: { root: coreServices.rootLogger },
          factory: ({ root }, { pluginId }) => root.child({ plugin: pluginId }),
        }),
      ] as ServiceFactory[],
    };
  },

  /**
   * Database service on a real PostgreSQL (see createTestDatabase); each plugin gets its own schema, named after
   * the plugin. Pools are closed by the test backend's stop().
   */
  database(connectionString: string): ServiceFactory {
    return createServiceFactory({
      service: coreServices.database,
      deps: {},
      factory: (_deps, { pluginId = '' }): DatabaseService => {
        const pool = new pg.Pool({ connectionString, max: 4 });
        managePool(pool);
        return { schema: pluginId.replaceAll('-', '_'), db: drizzle(pool) };
      },
    });
  },
};

export function httpRouterFactories(collected: Map<string, CollectedRoutes>): ServiceFactory {
  return createServiceFactory({
    service: coreServices.httpRouter,
    deps: {},
    factory: (_deps, { pluginId = '' }): HttpRouterService => {
      const entry: CollectedRoutes = { pluginId, routes: [] };
      collected.set(pluginId, entry);
      return { use: (routes) => void entry.routes.push(routes) };
    },
  });
}
