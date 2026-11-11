import { createPortalHost } from './host.js';

const host = createPortalHost();
await host.server.listen({ port: host.port, host: host.hostname });
host.logger.info({ host: host.hostname, port: host.port }, 'fasrun-portal-web listening');
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void host.stop().then(() => process.exit(0)));
}
