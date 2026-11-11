// Assembly only (tech plan 2.1): wires the services the plugin needs to its application layer.
import { coreServices, createBackendPlugin } from '@fasrun/backend-plugin-api';
import { getStatus } from '../application/status.js';

export const orchestrationPlugin = createBackendPlugin({
  pluginId: 'orchestration',
  register(env) {
    env.registerInit({
      deps: { logger: coreServices.logger, router: coreServices.httpRouter },
      init({ logger, router }) {
        router.use((app) => {
          app.get('/status', (_request, reply) => reply.send(getStatus()));
          return Promise.resolve();
        });
        logger.info('orchestration plugin initialised');
      },
    });
  },
});
