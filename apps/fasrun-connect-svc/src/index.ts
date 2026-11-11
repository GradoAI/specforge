import { runBackend } from '@fasrun/backend-defaults';
import { createConnectHost } from './host.js';

const host = createConnectHost();
if (await runBackend(host.backend, host.logger)) {
  await host.backend.server.listen({ port: host.port, host: host.hostname });
  host.logger.info({ host: host.hostname, port: host.port }, 'fasrun-connect-svc listening');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void host.stop().then(() => process.exit(0)));
  }
}
