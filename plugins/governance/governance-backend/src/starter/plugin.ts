// Assembly only (tech plan 2.1): wires the services the plugin needs to its application layer.
import { coreServices, createBackendPlugin, type OutboxRegistry } from '@fasrun/backend-plugin-api';
import { outboxes } from '@fasrun/plugin-governance-node';
import { getStatus } from '../application/status.js';

export function createGovernancePlugin(registry?: OutboxRegistry) {
  return createBackendPlugin({
    pluginId: 'governance',
    register(env) {
      if (registry) env.registerExtensionPoint(outboxes, registry);
      env.registerInit({
        deps: { logger: coreServices.logger, router: coreServices.httpRouter },
        init({ logger, router }) {
          router.use((app) => {
            app.get('/status', (_request, reply) => reply.send(getStatus()));
            return Promise.resolve();
          });
          logger.info('governance plugin initialised');
        },
      });
    },
  });
}
export const governancePlugin = createGovernancePlugin();
