import { runBackend } from '@fasrun/backend-defaults';
import { createCoreHost } from './host.js';

const host = createCoreHost();
if (await runBackend(host.backend, host.logger)) {
  await host.backend.server.listen({ port: host.port, host: host.hostname });
  host.logger.info({ host: host.hostname, port: host.port }, 'fasrun-core-svc listening');
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void host.stop().then(() => process.exit(0)));
  }
}
