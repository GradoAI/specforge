// FASRUN-CONNECT-SVC host (SF-1 D-5): no database; /readyz checks that fasrun-core-svc answers /healthz.
import type { BackendFeature } from '@fasrun/backend-plugin-api';
import { createBackend, createRootConfig, type Backend } from '@fasrun/backend-defaults';
import { pino, type Logger } from 'pino';
import { registerHostRoutes } from './http.js';
import { plugins as defaultPlugins } from './plugins.js';

export const COMPONENT = 'connect';
export const DEFAULT_PORT = 7011;

export interface ConnectHostOptions {
  env?: Readonly<Record<string, string | undefined>>;
  logger?: Logger;
  plugins?: readonly BackendFeature[];
}

export interface ConnectHost {
  readonly backend: Backend;
  readonly logger: Logger;
  readonly port: number;
  stop(): Promise<void>;
}

export function createConnectHost(options: ConnectHostOptions = {}): ConnectHost {
  const env = options.env ?? process.env;
  const logger = options.logger ?? pino({ base: { component: 'fasrun-connect-svc' } });
  const config = createRootConfig(COMPONENT, env);
  const coreHealth = new URL('/healthz', config.getRequired('CORE_URL'));
  const backend = createBackend({ component: COMPONENT, env, logger });
  for (const plugin of options.plugins ?? defaultPlugins) backend.add(plugin);
  registerHostRoutes(backend.server, logger, {
    ready: async () => {
      const response = await fetch(coreHealth, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error(`fasrun-core-svc /healthz returned ${response.status}`);
    },
  });
  return {
    backend,
    logger,
    port: Number(config.get('PORT') ?? DEFAULT_PORT),
    stop: () => backend.stop(),
  };
}
