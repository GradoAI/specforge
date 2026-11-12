import { createTestDatabase } from '@fasrun/test-utils';
import pg from 'pg';
import { expect, inject, it, vi } from 'vitest';
import { createTestPool, disposeTestDatabase } from './test-pool.js';

it('TC-SF5-GOVERNANCE-002 cleanup waits for real client end before dropping its database', async () => {
  const database = await createTestDatabase(inject('fasrunPostgres'));
  const resource = createTestPool('app', { connectionString: database.appUrl });
  let ended = false;
  const client = await resource.pool.connect();
  client.once('end', () => {
    ended = true;
  });
  const original = client.end.bind(client);
  let permitEnd: (() => void) | undefined;
  vi.spyOn(client, 'end').mockImplementation((callback: (error: Error) => void) => {
    permitEnd = () => {
      permitEnd = undefined;
      void original(callback);
    };
  });
  client.release();
  let dropped = false;
  const cleanup = disposeTestDatabase([resource], async () => {
    expect(ended).toBe(true);
    dropped = true;
    await database.drop();
  });
  try {
    await vi.waitFor(() => expect(permitEnd).toBeTypeOf('function'));
    expect(resource.pool.ended).toBe(true);
    expect(ended).toBe(false);
    expect(dropped).toBe(false);
    permitEnd!();
    await cleanup;
    expect(dropped).toBe(true);
  } finally {
    permitEnd?.();
    await cleanup.catch(() => undefined);
    await database.drop();
  }
});

it('TC-SF5-IDENTITY-013 idle backend termination fails cleanup without serializing driver credentials', async () => {
  const database = await createTestDatabase(inject('fasrunPostgres'));
  const resource = createTestPool('app', { connectionString: database.appUrl });
  const admin = new pg.Client({ connectionString: inject('fasrunPostgres').adminUrl });
  try {
    await admin.connect();
    const result = await resource.pool.query<{ pid: number }>('select pg_backend_pid() pid');
    const idleError = new Promise<void>((resolve) => resource.pool.once('error', () => resolve()));
    await admin.query('select pg_terminate_backend($1)', [result.rows[0]!.pid]);
    await idleError;
    // Adversarial code must not become a diagnostic field; no raw error/client is retained.
    resource.pool.emit(
      'error',
      Object.assign(new Error('secret-message-canary'), {
        code: 'secret-code-canary',
        client: { password: 'secret-password-canary' },
      }),
    );
    let message = '';
    try {
      await disposeTestDatabase([resource], () => database.drop());
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('57P01');
    expect(message).toContain('unknown');
    expect(message).not.toContain('secret-');
    expect(message).not.toContain('client');
    expect(message).not.toContain(database.appUrl);
    expect(message).not.toContain(inject('fasrunPostgres').roles.app.password);
    expect(message).toContain('lifecycle failed');
  } finally {
    await resource.close();
    await admin.end();
    await database.drop();
  }
});
