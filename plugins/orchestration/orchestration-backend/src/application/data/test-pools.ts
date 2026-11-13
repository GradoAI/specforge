import pg from 'pg';

// Local integration-test lifecycle: pg.Pool.end() can precede each socket's end event.
const states = new WeakMap<pg.Pool, { ended: Promise<void>[]; codes: Set<string> }>();
export function testPool(options: pg.PoolConfig): pg.Pool {
  const pool = new pg.Pool(options);
  const state = { ended: [] as Promise<void>[], codes: new Set<string>() };
  states.set(pool, state);
  const failure = (error: unknown) => {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    state.codes.add(typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'POOL_ERROR');
  };
  pool.on('error', failure);
  pool.on('connect', (client) => {
    client.on('error', failure);
    state.ended.push(new Promise<void>((resolve) => client.once('end', resolve)));
  });
  return pool;
}
export async function closeTestPools(...pools: (pg.Pool | undefined)[]): Promise<void> {
  const failures: string[] = [];
  await Promise.all(
    pools
      .filter((pool) => pool !== undefined)
      .map(async (pool) => {
        const state = states.get(pool);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            (async () => {
              await pool.end();
              await Promise.all(state?.ended ?? []);
            })(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('POOL_CLOSE_TIMEOUT')), 5000);
            }),
          ]);
        } catch {
          failures.push('POOL_CLOSE_FAILED');
        } finally {
          clearTimeout(timer);
        }
        failures.push(...(state?.codes ?? []));
      }),
  );
  if (failures.length) throw new Error(`Data test pool lifecycle failed: ${[...new Set(failures)].join(',')}`);
}
