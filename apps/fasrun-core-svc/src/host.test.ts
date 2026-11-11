// FASRUN-CORE-SVC host (SF-1 T007, D-5).
// TC-PLATFORM-010 — R-platform-004.S1: ready when the database can be reached.
// TC-PLATFORM-011 — R-platform-004.S2: /readyz fails and /healthz stays up when the database cannot be reached.
// TC-PLATFORM-012 — R-platform-004.S3: request logs are structured JSON with level, time, message and request id.
import { Writable } from 'node:stream';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createCoreHost, type CoreHost } from './host.js';
import { ulid } from './http.js';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      done();
    },
  });
  return { logger: pino(stream), lines };
}

const hosts: CoreHost[] = [];
const start = async (databaseUrl: string, logger = captureLogger().logger) => {
  const host = createCoreHost({ env: { FASRUN_CORE_DATABASE_URL: databaseUrl }, logger });
  hosts.push(host);
  await host.backend.start();
  return host;
};
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((h) => h.stop()));
});

describe('fasrun-core-svc with a database (R-platform-004)', () => {
  let database: StartedPostgreSqlContainer | undefined;
  let databaseUrl = '';
  beforeAll(async () => {
    database = await new PostgreSqlContainer('postgres:18-alpine').start();
    databaseUrl = database.getConnectionUri();
  }, 180_000);
  afterAll(async () => {
    await database?.stop();
  });

  it('TC-PLATFORM-010 /readyz returns 200 when the database can be reached', async () => {
    const host = await start(databaseUrl);
    const response = await host.backend.server.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });
});

describe('fasrun-core-svc without a database (R-platform-004)', () => {
  it('TC-PLATFORM-011 /readyz returns 503 and /healthz 200 when the database cannot be reached', async () => {
    // Port 1 on the loopback interface: nothing listens, the connection is refused at once.
    const host = await start('postgres://fasrun@127.0.0.1:1/fasrun');
    const ready = await host.backend.server.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ status: 'not_ready' });
    expect((await host.backend.server.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });

  it('TC-PLATFORM-012 each request writes one JSON log line with level, time, message and request id', async () => {
    const { logger, lines } = captureLogger();
    const host = await start('postgres://fasrun@127.0.0.1:1/fasrun', logger);
    const response = await host.backend.server.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'req-test-1' },
    });
    expect(response.headers['x-request-id']).toBe('req-test-1');
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const entry = entries.find((e) => e.msg === 'request completed');
    expect(entry).toMatchObject({ level: 30, reqId: 'req-test-1', method: 'GET', url: '/healthz', statusCode: 200 });
    expect(typeof entry?.time).toBe('number');

    const generated = await host.backend.server.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'bad id!' },
    });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('listens on 127.0.0.1 unless FASRUN_CORE_HOST is set', async () => {
    const local = createCoreHost({
      env: { FASRUN_CORE_DATABASE_URL: 'postgres://fasrun@127.0.0.1:1/fasrun' },
      logger: captureLogger().logger,
    });
    const open = createCoreHost({
      env: { ...{ FASRUN_CORE_DATABASE_URL: 'postgres://fasrun@127.0.0.1:1/fasrun' }, FASRUN_CORE_HOST: '0.0.0.0' },
      logger: captureLogger().logger,
    });
    expect([local.hostname, open.hostname]).toEqual(['127.0.0.1', '0.0.0.0']);
    await Promise.all([local.stop(), open.stop()]);
  });

  it('requires FASRUN_CORE_DATABASE_URL', () => {
    expect(() => createCoreHost({ env: {}, logger: captureLogger().logger })).toThrow(/FASRUN_CORE_DATABASE_URL/);
  });

  it('generates sortable ULIDs', () => {
    const [a, b] = [ulid(1_000), ulid(2_000)];
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
  });
});
