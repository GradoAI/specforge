import { expect, it, vi } from 'vitest';
import pg from 'pg';
import { createTestPool, disposeTestDatabase } from './test-pool.js';
it('TC-SF5-GOVERNANCE-002 bounded shutdown still attempts owned database cleanup and fails closed', async () => {
  const resource = createTestPool('owner', {}, 10);
  resource.pool.emit('connect', new pg.Client());
  const drop = vi.fn(() => Promise.resolve());
  await expect(disposeTestDatabase([resource], drop)).rejects.toThrow('close-timeout');
  expect(drop).toHaveBeenCalledOnce();
});
it('TC-SF5-IDENTITY-013 cleanup errors never expose raw driver message or cause', async () => {
  const resource = createTestPool('app', {});
  await expect(
    disposeTestDatabase([resource], () =>
      Promise.reject(Object.assign(new Error('secret-canary'), { cause: { password: 'secret-canary' } })),
    ),
  ).rejects.toThrow(/^Test database cleanup failed$/);
});
