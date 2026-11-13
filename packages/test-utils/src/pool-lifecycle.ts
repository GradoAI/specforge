// Private test-host ownership: observe clients before plugins can use the pool.
import type pg from 'pg';

// Real local close normally takes milliseconds; leave a finite 2s cleanup window,
// below the unit-test deadline. This does not change any existing test budget.
const CLOSE_DEADLINE_MS = 2_000;
type Stage =
  | 'pool-error'
  | 'client-error'
  | 'pool-close'
  | 'client-close'
  | 'close-timeout'
  | 'server-close'
  | 'container-dispose';

export function cleanupFailure(stage: Stage, error?: unknown): Error {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  // Enumerate permitted diagnostics; arbitrary five-character strings can contain secrets too.
  const safe =
    typeof code === 'string' &&
    ['57P01', '57P02', '57P03', '08003', '08006', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(code)
      ? code
      : 'UNKNOWN';
  return new Error(`Test backend cleanup failed: ${stage} (${safe})`);
}

export interface PoolLifecycle {
  stop(): Promise<void>;
}
const owners = new WeakMap<pg.Pool, PoolLifecycle>();

export function managePool(pool: pg.Pool): PoolLifecycle {
  const existing = owners.get(pool);
  if (existing) return existing;
  const clients = new Map<pg.PoolClient, Promise<void>>();
  const failures = new Map<string, Error>();
  const record = (stage: Stage, error?: unknown) => {
    const safe = cleanupFailure(stage, error);
    failures.set(safe.message, safe);
  };
  pool.on('error', (error: Error) => record('pool-error', error));
  pool.on('connect', (client: pg.PoolClient) => {
    clients.set(
      client,
      new Promise<void>((resolve) => {
        client.once('end', () => {
          clients.delete(client);
          resolve();
        });
      }),
    );
    // Keep the listener through physical end, including after pg-pool removes idle clients.
    client.on('error', (error: Error) => record('client-error', error));
  });
  const requestClientEnds = () => {
    for (const client of clients.keys()) {
      try {
        void client.end().catch((error: unknown) => record('client-close', error));
      } catch (error) {
        record('client-close', error);
      }
    }
  };
  let stopping: Promise<void> | undefined;
  const lifecycle: PoolLifecycle = {
    stop() {
      stopping ??= (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const close = async () => {
          try {
            await pool.end();
          } catch (error) {
            record('pool-close', error);
            requestClientEnds();
          }
          // pg-pool may finish before actual end, including connections removed on idle error.
          await Promise.all(clients.values());
        };
        try {
          await Promise.race([
            close(),
            new Promise<void>((resolve) => {
              timer = setTimeout(() => {
                record('close-timeout');
                requestClientEnds();
                resolve();
              }, CLOSE_DEADLINE_MS);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
        if (failures.size) throw new AggregateError([...failures.values()], 'Test backend database cleanup failed');
      })();
      return stopping;
    },
  };
  owners.set(pool, lifecycle);
  return lifecycle;
}
