import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupFailure, managePool } from './pool-lifecycle.js';

function fixture() {
  const pool = Object.assign(new EventEmitter(), { end: vi.fn(() => Promise.resolve()) });
  const owner = managePool(pool as unknown as pg.Pool);
  const client = Object.assign(new EventEmitter(), { end: vi.fn(() => Promise.resolve()) });
  pool.emit('connect', client);
  return { pool, client, owner };
}
afterEach(() => vi.useRealTimers());

describe('TC-PLATFORM-032 managed connection shutdown', () => {
  it('waits for physical end after pool removal and shares concurrent/repeated stop', async () => {
    const { pool, client, owner } = fixture();
    let finished = false;
    const stop = owner.stop();
    void stop.then(() => {
      finished = true;
    });
    pool.emit('remove', client);
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(owner.stop()).toBe(stop);
    client.emit('end');
    await stop;
    expect(owner.stop()).toBe(stop);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('reports bounded incomplete shutdown (pool pending=%s)', async (poolPending) => {
    vi.useFakeTimers();
    const { pool, client, owner } = fixture();
    if (poolPending) pool.end.mockImplementation(() => new Promise(() => undefined));
    const result = owner.stop().catch((error: unknown) => inspect(error));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toContain('close-timeout');
    expect(client.end).toHaveBeenCalledTimes(1);
    client.emit('end');
  });

  it('retains failures, finishes remaining closes, and never retains raw driver fields', async () => {
    const { pool, client, owner } = fixture();
    const secret = 'canary-password-and-url';
    const raw = Object.assign(new Error(secret), { code: '57P01', client: { connectionString: secret } });
    pool.emit('error', raw, client);
    pool.end.mockRejectedValue(raw);
    const stop = owner.stop();
    client.emit('end');
    const error = await stop.catch((failure: unknown) => failure);
    const rendered = inspect(error, { showHidden: true, depth: 20 });
    expect(rendered).toContain('57P01');
    expect(rendered).toContain('pool-close');
    expect(rendered).not.toContain(secret);
    expect(rendered).not.toContain('connectionString');
    await expect(owner.stop()).rejects.toBe(error);
  });

  it('does not treat arbitrary error codes as safe diagnostics', () => {
    expect(cleanupFailure('pool-error', { code: 'TOKEN' }).message).toContain('UNKNOWN');
  });
});
