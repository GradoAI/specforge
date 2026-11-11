import { createPortalHost } from './host.js';

const host = createPortalHost();
// Bound to the loopback interface only; container deployments set their own network (SF-1 D-18).
await host.server.listen({ port: host.port, host: '127.0.0.1' });
host.logger.info({ port: host.port }, 'fasrun-portal-web listening');
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void host.stop().then(() => process.exit(0)));
}
