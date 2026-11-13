import { coreServices, createBackendPlugin } from '@fasrun/backend-plugin-api';
import { sql } from 'drizzle-orm';
import { inspect } from 'node:util';
import pg from 'pg';
import { expect, inject, it, vi } from 'vitest';
import { mockServices } from './mock-services.js';
import { managePool } from './pool-lifecycle.js';
import { createTestDatabase } from './postgres.js';
import { startTestBackend } from './test-backend.js';

it('TC-PLATFORM-032 real host stop waits for physical client end before database deletion', async () => {
  const database = await createTestDatabase(inject('fasrunPostgres'));
  let pool!: pg.Pool;
  const backend = await startTestBackend({
    services: [mockServices.database(database.ownerUrl)],
    features: [
      createBackendPlugin({
        pluginId: 'lifecycle',
        register(env) {
          env.registerInit({
            deps: { database: coreServices.database },
            async init({ database: service }) {
              pool = (service.db as typeof service.db & { $client: pg.Pool }).$client;
              await service.db.execute(sql`select 1`);
            },
          });
        },
      }),
    ],
  });
  const client = await pool.connect();
  const pid = (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;
  const originalEnd = client.end.bind(client);
  const endRequested = Promise.withResolvers<void>();
  const ended = new Promise<void>((resolve) => client.once('end', resolve));
  // pg's last overload is callback-only; this probe intercepts the promise form.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(client, 'end').mockImplementation(() => {
    endRequested.resolve();
    return Promise.resolve();
  });
  client.release();
  const poolFinished = Promise.withResolvers<void>();
  const originalPoolEnd = pool.end.bind(pool);
  // pg's last overload is callback-only; the host invokes the promise form.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.spyOn(pool, 'end').mockImplementation(async () => {
    await originalPoolEnd();
    poolFinished.resolve();
  });
  let stopped = false;
  let dropped = false;
  const stop = backend.stop().then(() => {
    stopped = true;
  });
  const admin = new pg.Client({ connectionString: inject('fasrunPostgres').adminUrl });
  await admin.connect();
  try {
    await endRequested.promise;
    await poolFinished.promise;
    const live = await admin.query<{ count: string }>('select count(*) from pg_stat_activity where pid=$1', [pid]);
    expect(live.rows[0]!.count).toBe('1');
    expect(stopped).toBe(false);
    const cleanup = stop.then(async () => {
      await database.drop();
      dropped = true;
    });
    expect(dropped).toBe(false);
    await originalEnd();
    await ended;
    await cleanup;
    expect(stopped).toBe(true);
    expect(dropped).toBe(true);
    await backend.stop();
  } finally {
    vi.restoreAllMocks();
    await originalEnd();
    await backend.stop();
    await admin.end();
    await database.drop();
  }
});

it('TC-PLATFORM-033 real idle backend termination fails shutdown with only safe diagnostics', async () => {
  const database = await createTestDatabase(inject('fasrunPostgres'));
  const pool = new pg.Pool({ connectionString: database.ownerUrl });
  const owner = managePool(pool);
  const admin = new pg.Client({ connectionString: inject('fasrunPostgres').adminUrl });
  await admin.connect();
  try {
    const client = await pool.connect();
    const pid = (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;
    const ended = new Promise<void>((resolve) => client.once('end', resolve));
    const healthy = await pool.connect();
    let healthyEnded = false;
    healthy.once('end', () => {
      healthyEnded = true;
    });
    healthy.release();
    client.release();
    await admin.query('select pg_terminate_backend($1)', [pid]);
    await ended;
    const failure = await owner.stop().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(healthyEnded).toBe(true);
    const remaining = await admin.query<{ count: string }>('select count(*) from pg_stat_activity where datname=$1', [
      database.name,
    ]);
    expect(remaining.rows[0]!.count).toBe('0');
    const output = inspect(failure, { showHidden: true, depth: 20 });
    expect(output).toContain('57P01');
    expect(output).not.toContain(database.ownerUrl);
    expect(output).not.toContain(new URL(database.ownerUrl).password);
    expect(output).not.toMatch(/connectionParameters|password|severity|routine|\[cause\]/);
    await expect(owner.stop()).rejects.toBe(failure);
  } finally {
    await owner.stop().catch(() => undefined); // Expected failure was asserted above; still release resources.
    await admin.end();
    await database.drop();
  }
});
