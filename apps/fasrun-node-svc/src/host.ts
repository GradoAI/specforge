// FASRUN-NODE-SVC host (SF-1 D-5): no database; ready once its plugins are assembled.
import type { BackendFeature } from '@fasrun/backend-plugin-api';
import { createBackend, createRootConfig, type Backend } from '@fasrun/backend-defaults';
import { pino, type Logger } from 'pino';
import { registerHostRoutes } from './http.js';
import { plugins as defaultPlugins } from './plugins.js';

export const COMPONENT = 'node';
export const DEFAULT_PORT = 7012;

export interface NodeHostOptions {
  env?: Readonly<Record<string, string | undefined>>;
  logger?: Logger;
  plugins?: readonly BackendFeature[];
}

export interface NodeHost {
  readonly backend: Backend;
  readonly logger: Logger;
  readonly port: number;
  stop(): Promise<void>;
}

export function createNodeHost(options: NodeHostOptions = {}): NodeHost {
  const env = options.env ?? process.env;
  const logger = options.logger ?? pino({ base: { component: 'fasrun-node-svc' } });
  const config = createRootConfig(COMPONENT, env);
  const assembled = createBackend({ component: COMPONENT, env, logger });
  let initialised = false;
  // /readyz answers 200 only after the plugins are assembled.
  const backend: Backend = {
    server: assembled.server,
    add: (feature) => assembled.add(feature),
    start: async () => {
      await assembled.start();
      initialised = true;
    },
    stop: () => assembled.stop(),
  };
  for (const plugin of options.plugins ?? defaultPlugins) backend.add(plugin);
  registerHostRoutes(backend.server, logger, {
    ready: () => (initialised ? Promise.resolve() : Promise.reject(new Error('initialisation not finished'))),
  });
  return {
    backend,
    logger,
    port: Number(config.get('PORT') ?? DEFAULT_PORT),
    stop: () => backend.stop(),
  };
}
