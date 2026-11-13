// Assembly only (tech plan 2.1): wires the services the plugin needs to its application layer.
import { coreServices, createBackendPlugin } from '@fasrun/backend-plugin-api';
import { connectAdapters, type ConnectAdapters } from '@fasrun/plugin-connect-node';
import { createConnectAdapters } from './adapters.js';
import { getStatus } from '../application/status.js';

export function createConnectPlugin(adapters: ConnectAdapters = createConnectAdapters()) {
  return createBackendPlugin({
    pluginId: 'connect',
    register(env) {
      env.registerExtensionPoint(connectAdapters, adapters);
      env.registerInit({
        deps: { logger: coreServices.logger, router: coreServices.httpRouter },
        init({ logger, router }) {
          router.use((app) => {
            app.get('/status', (_request, reply) => reply.send(getStatus()));
            return Promise.resolve();
          });
          logger.info('connect plugin initialised');
        },
      });
    },
  });
}
export const connectPlugin = createConnectPlugin();
