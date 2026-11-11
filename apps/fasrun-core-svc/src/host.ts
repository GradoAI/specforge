// FASRUN-CORE-SVC host (SF-1 D-5): the only backend host with a database; /readyz runs `select 1`.
import type { BackendFeature } from '@fasrun/backend-plugin-api';
import { createBackend, createRootConfig, type Backend } from '@fasrun/backend-defaults';
import pg from 'pg';
import { pino, type Logger } from 'pino';
import { registerHostRoutes, withTimeout } from './http.js';
import { plugins as defaultPlugins } from './plugins.js';

export const COMPONENT = 'core';
/** Loopback by default; container images and the Helm chart set 0.0.0.0 (SF-1 T018, T019). */
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 7010;

export interface CoreHostOptions {
  env?: Readonly<Record<string, string | undefined>>;
  logger?: Logger;
  plugins?: readonly BackendFeature[];
}

export interface CoreHost {
  readonly backend: Backend;
  readonly logger: Logger;
  readonly port: number;
  /** Listen address from FASRUN_CORE_HOST. */
  readonly hostname: string;
  stop(): Promise<void>;
}

export function createCoreHost(options: CoreHostOptions = {}): CoreHost {
  const env = options.env ?? process.env;
  const logger = options.logger ?? pino({ base: { component: 'fasrun-core-svc' } });
  const config = createRootConfig(COMPONENT, env);
  const pool = new pg.Pool({
    connectionString: config.getRequired('DATABASE_URL'),
    connectionTimeoutMillis: 2000,
    max: 2,
  });
  // A failed idle connection must not crash the process; readiness reports it instead.
  pool.on('error', (error) => logger.warn({ err: error }, 'database connection error'));
  const backend = createBackend({ component: COMPONENT, env, logger });
  for (const plugin of options.plugins ?? defaultPlugins) backend.add(plugin);
  registerHostRoutes(backend.server, logger, {
    ready: async () => {
      await withTimeout(pool.query('select 1'), 2000, 'database check');
    },
  });
  return {
    backend,
    logger,
    port: Number(config.get('PORT') ?? DEFAULT_PORT),
    hostname: config.get('HOST') ?? DEFAULT_HOST,
    async stop() {
      await backend.stop();
      await pool.end();
    },
  };
}
