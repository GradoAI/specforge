// FASRUN-PORTAL-WEB host (SF-1 D-5): serves the Rsbuild output; ready when the page can be read.
import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { pino, type Logger } from 'pino';
import { registerHostRoutes } from './http.js';

export const DEFAULT_PORT = 7013;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface PortalHostOptions {
  env?: Readonly<Record<string, string | undefined>>;
  logger?: Logger;
  /** Directory with the built page; defaults to dist/web next to the built server. */
  webRoot?: string;
}

export interface PortalHost {
  readonly server: FastifyInstance;
  readonly logger: Logger;
  readonly port: number;
  stop(): Promise<void>;
}

export function createPortalHost(options: PortalHostOptions = {}): PortalHost {
  const env = options.env ?? process.env;
  const logger = options.logger ?? pino({ base: { component: 'fasrun-portal-web' } });
  const webRoot = resolve(options.webRoot ?? fileURLToPath(new URL('../web/', import.meta.url)));
  const index = join(webRoot, 'index.html');
  const server = Fastify({ logger: false });
  registerHostRoutes(server, logger, { ready: () => access(index, constants.R_OK) });

  const serve = async (request: FastifyRequest, reply: FastifyReply) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://portal.invalid').pathname);
    } catch {
      return reply.code(400).send();
    }
    const file = resolve(webRoot, `.${path}`);
    if (file !== webRoot && !file.startsWith(webRoot + sep)) return reply.code(404).send();
    const isFile = await stat(file).then(
      (s) => s.isFile(),
      () => false,
    );
    // Unknown paths fall back to the page, which handles its own routes.
    const target = isFile ? file : index;
    const body = await readFile(target).catch(() => undefined);
    if (!body) return reply.code(404).send();
    return reply.type(CONTENT_TYPES[extname(target)] ?? 'application/octet-stream').send(body);
  };
  server.get('/', serve);
  server.get('/*', serve);

  return {
    server,
    logger,
    port: Number(env.FASRUN_PORTAL_PORT ?? DEFAULT_PORT),
    stop: () => server.close(),
  };
}
