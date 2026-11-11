// Default service factories: configuration, logging, database and HTTP routing (SF-1 D-4).
// Other core services have no default factory; depending on them fails at startup.
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
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
import type { Logger } from 'pino';

export function createRootConfig(
  component: string,
  env: Readonly<Record<string, string | undefined>>,
): RootConfigService {
  const segment = component.toUpperCase().replaceAll('-', '_');
  const prefix = `FASRUN_${segment}_`;
  const values = Object.fromEntries(
    Object.entries(env)
      .filter((entry): entry is [string, string] => entry[0].startsWith(prefix) && entry[1] !== undefined)
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
  return {
    component: segment,
    get: (name) => values[name],
    getRequired(name) {
      const value = values[name];
      if (!value) {
        throw new FasrunError(ErrorCodes.CONFIG_INVALID, `Missing configuration ${prefix}${name}`, {
          variable: `${prefix}${name}`,
        });
      }
      return value;
    },
    parse(schema) {
      try {
        return schema.parse(values);
      } catch (error) {
        throw new FasrunError(
          ErrorCodes.CONFIG_INVALID,
          `Invalid configuration for ${prefix}*`,
          { component: segment },
          {
            cause: error,
          },
        );
      }
    },
  };
}

/** Adapts pino to LoggerService (message first, structured fields second). */
export function wrapPino(logger: Logger): LoggerService {
  const write =
    (level: 'debug' | 'info' | 'warn' | 'error') =>
    (message: string, fields?: LogFields): void => {
      logger[level](fields ?? {}, message);
    };
  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    child: (fields) => wrapPino(logger.child(fields)),
  };
}

/** One connection pool per backend; connections open on the first query. */
export const rootDatabasePoolRef = createServiceRef<pg.Pool>({ id: 'defaults.rootDatabasePool', scope: 'root' });

/** Routes collected per plugin, mounted by the backend once every plugin has initialised. */
export const httpRoutesRef = createServiceRef<{ pluginId: string; routes: FastifyPluginAsync[] }>({
  id: 'defaults.httpRoutes',
});

export function defaultServiceFactories(options: {
  rootConfig: RootConfigService;
  rootLogger: Logger;
}): ServiceFactory[] {
  return [
    createServiceFactory({ service: coreServices.rootConfig, deps: {}, factory: () => options.rootConfig }),
    createServiceFactory({ service: coreServices.rootLogger, deps: {}, factory: () => wrapPino(options.rootLogger) }),
    createServiceFactory({
      service: coreServices.logger,
      deps: { rootLogger: coreServices.rootLogger },
      factory: ({ rootLogger }, { pluginId }) => rootLogger.child({ plugin: pluginId }),
    }),
    createServiceFactory({
      service: rootDatabasePoolRef,
      deps: { config: coreServices.rootConfig },
      factory: ({ config }) => new pg.Pool({ connectionString: config.getRequired('DATABASE_URL') }),
    }),
    createServiceFactory({
      service: coreServices.database,
      deps: { pool: rootDatabasePoolRef },
      factory: ({ pool }, { pluginId = '' }) => ({ schema: pluginId.replaceAll('-', '_'), db: drizzle(pool) }),
    }),
    createServiceFactory({
      service: httpRoutesRef,
      deps: {},
      factory: (_deps, { pluginId = '' }) => ({ pluginId, routes: [] }),
    }),
    createServiceFactory({
      service: coreServices.httpRouter,
      deps: { collected: httpRoutesRef },
      factory: ({ collected }): HttpRouterService => ({ use: (routes) => void collected.routes.push(routes) }),
    }),
  ] as ServiceFactory[];
}
