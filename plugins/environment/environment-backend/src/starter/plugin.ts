// Assembly only (tech plan 2.1): wires the services the plugin needs to its application layer.
import { coreServices, createBackendPlugin } from '@fasrun/backend-plugin-api';
import { getStatus } from '../application/status.js';

export const environmentPlugin = createBackendPlugin({
  pluginId: 'environment',
  register(env) {
    env.registerInit({
      deps: { logger: coreServices.logger, router: coreServices.httpRouter },
      init({ logger, router }) {
        router.use((app) => {
          app.get('/status', (_request, reply) => reply.send(getStatus()));
          return Promise.resolve();
        });
        logger.info('environment plugin initialised');
      },
    });
  },
});
