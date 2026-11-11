// Host HTTP plumbing (SF-1 D-5): request identifiers, structured request logs, /healthz and /readyz.
// The same file is used by every host; it moves into backend-defaults once createBackend accepts Fastify options.
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

declare module 'fastify' {
  interface FastifyRequest {
    reqId: string;
  }
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ULID (48-bit time, 80-bit randomness, Crockford Base32); contracts-core gets the shared version in T011. */
export function ulid(now = Date.now()): string {
  let time = '';
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD.charAt(t % 32) + time;
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => CROCKFORD.charAt(byte % 32));
  return time + random.join('');
}

/** Accepts a caller-supplied x-request-id only if it is short and made of safe characters. */
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export interface HostRoutesOptions {
  /** Resolves when the host's dependencies are ready; rejects with the reason otherwise. */
  ready(): Promise<void>;
}

export function registerHostRoutes(server: FastifyInstance, logger: Logger, options: HostRoutesOptions): void {
  server.decorateRequest('reqId', '');
  server.addHook('onRequest', (request, reply, done) => {
    const header = request.headers['x-request-id'];
    request.reqId = typeof header === 'string' && REQUEST_ID.test(header) ? header : ulid();
    void reply.header('x-request-id', request.reqId);
    done();
  });
  server.addHook('onResponse', (request, reply, done) => {
    logger.info(
      {
        reqId: request.reqId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
    done();
  });
  server.get('/healthz', (_request, reply) => reply.send({ status: 'ok' }));
  server.get('/readyz', async (request, reply) => {
    try {
      await options.ready();
      return await reply.send({ status: 'ready' });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn({ reqId: request.reqId, reason }, 'not ready');
      return await reply.code(503).send({ status: 'not_ready', reason });
    }
  });
}

/** Rejects after `ms` milliseconds unless `promise` settles first. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
