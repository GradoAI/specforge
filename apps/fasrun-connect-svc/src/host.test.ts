// FASRUN-CONNECT-SVC host (SF-1 T007, D-5).
// TC-PLATFORM-014 — R-platform-004.S5: readiness depends on fasrun-core-svc; no database is configured.
import type { AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { createConnectHost, type ConnectHost } from './host.js';

const silent = pino({ level: 'silent' });
const hosts: ConnectHost[] = [];
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((h) => h.stop()));
});

describe('fasrun-connect-svc (R-platform-004)', () => {
  it('TC-PLATFORM-014 /readyz follows fasrun-core-svc while /healthz stays up', async () => {
    const core = Fastify();
    core.get('/healthz', (_request, reply) => reply.send({ status: 'ok' }));
    await core.listen({ port: 0, host: '127.0.0.1' });
    const { port } = core.server.address() as AddressInfo;

    const env = { FASRUN_CONNECT_CORE_URL: `http://127.0.0.1:${port}` };
    expect(Object.keys(env).some((key) => key.includes('DATABASE'))).toBe(false);
    const host = createConnectHost({ env, logger: silent });
    hosts.push(host);
    await host.backend.start();
    const server = host.backend.server;

    expect((await server.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
    await core.close();
    const ready = await server.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ status: 'not_ready' });
    expect((await server.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });

  it('requires FASRUN_CONNECT_CORE_URL', () => {
    expect(() => createConnectHost({ env: {}, logger: silent })).toThrow(/FASRUN_CONNECT_CORE_URL/);
  });
});
