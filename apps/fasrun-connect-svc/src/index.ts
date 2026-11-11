import { runBackend } from '@fasrun/backend-defaults';
import { createConnectHost } from './host.js';

const host = createConnectHost();
if (await runBackend(host.backend, host.logger)) {
  // Bound to the loopback interface only; container deployments set their own network (SF-1 D-18).
  await host.backend.server.listen({ port: host.port, host: '127.0.0.1' });
  host.logger.info({ port: host.port }, 'fasrun-connect-svc listening');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void host.stop().then(() => process.exit(0)));
  }
}
