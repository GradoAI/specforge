// Test-only lifecycle management: pg-pool.end() can resolve before client sockets close.
import pg from 'pg';
export type TestPoolName = 'owner' | 'app';
type Failure = { pool: TestPoolName; kind: 'idle-error' | 'close-error' | 'close-timeout'; code: string };
export function createTestPool(name: TestPoolName, options: pg.PoolConfig, timeoutMs = 5000) {
  const pool = new pg.Pool(options);
  const closes: Promise<void>[] = [];
  const failures: Failure[] = [];
  const code = (error: unknown): string => {
    const value =
      error && typeof error === 'object'
        ? (Object.getOwnPropertyDescriptor(error, 'code')?.value as unknown)
        : undefined;
    return typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : 'unknown';
  };
  pool.on('connect', (client) => {
    closes.push(new Promise<void>((resolve) => client.once('end', resolve)));
  });
  pool.on('error', (error: unknown) => {
    failures.push({ pool: name, kind: 'idle-error', code: code(error) });
  });
  let shutdown: Promise<void> | undefined;
  return {
    pool,
    close(): Promise<void> {
      return (shutdown ??= (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutError = new Error('Test pool close deadline');
        try {
          await Promise.race([
            (async () => {
              await pool.end();
              await Promise.all(closes);
            })(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(timeoutError), timeoutMs);
            }),
          ]);
        } catch (error) {
          failures.push({
            pool: name,
            kind: error === timeoutError ? 'close-timeout' : 'close-error',
            code: code(error),
          });
        } finally {
          if (timer) clearTimeout(timer);
        }
      })());
    },
    assertHealthy(): void {
      if (failures.length) throw new Error(`Test database lifecycle failed: ${JSON.stringify(failures)}`);
    },
  };
}
/** Run all owned cleanup steps before reporting sanitized failure; never expose driver objects. */
export async function disposeTestDatabase(pools: ReturnType<typeof createTestPool>[], drop: () => Promise<void>) {
  await Promise.all(pools.map((pool) => pool.close()));
  let dropFailed = false;
  try {
    await drop();
  } catch {
    dropFailed = true;
  }
  const failures: string[] = [];
  for (const pool of pools)
    try {
      pool.assertHealthy();
    } catch (error) {
      failures.push((error as Error).message);
    }
  if (dropFailed) failures.push('Test database cleanup failed');
  if (failures.length) throw new Error(failures.join('; '));
}
