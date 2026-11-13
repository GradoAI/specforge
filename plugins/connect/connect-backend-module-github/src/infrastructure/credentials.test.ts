import { it, expect } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createGitHubCredentials } from './credentials.js';
import { fixture } from '../test-fixture.js';
it('TC-SF5-CONNECT-005 real App JWT exchanges current key for exact repository-scoped installation token', async () => {
  const f = await fixture(),
    keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let count = 0,
    status = 201;
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      res.writeHead(500);
      res.end('{}');
    });
  });
  async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      expect(req.url).toBe('/app/installations/9/access_tokens');
      const jwt = req.headers.authorization!.slice(7),
        parts = jwt.split('.');
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(parts.slice(0, 2).join('.')),
          keys.publicKey,
          Buffer.from(parts[2]!, 'base64url'),
        ),
      ).toBe(true);
      const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as {
        iss: string;
        exp: number;
        iat: number;
      };
      expect(claims.iss).toBe('5');
      expect(claims.exp - claims.iat).toBe(600);
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c as Buffer));
      expect((JSON.parse(Buffer.concat(chunks).toString()) as { repository_ids: number[] }).repository_ids).toEqual([
        12,
      ]);
      count++;
      res.setHeader('content-type', 'application/json');
      if (status === 429) res.setHeader('retry-after', '15');
      res.writeHead(status);
      res.end(
        JSON.stringify({
          token: 'fixture-installation-token',
          expires_at: '2026-11-13T02:00:00Z',
          repositories: [{ id: 12 }],
        }),
      );
    } catch {
      res.writeHead(500);
      res.end('{}');
    }
  }
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const apiOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    secret = Buffer.from(
      JSON.stringify({
        privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        webhookSecret: 's'.repeat(32),
      }),
    );
  let reads = 0;
  const credentials = createGitHubCredentials({
    appId: '5',
    routes: [f.route],
    apiOrigin,
    allowLocalFixture: true,
    clock: f.deps.clock!,
    useSecret: async (_r, fn) => {
      reads++;
      return fn(Buffer.from(secret));
    },
  });
  try {
    expect(await credentials.use(f.route, (token) => Promise.resolve(token === 'fixture-installation-token'))).toBe(
      true,
    );
    expect(await credentials.use(f.route, () => Promise.resolve(true))).toBe(true);
    expect(count).toBe(2);
    expect(reads).toBe(2);
    for (const code of [401, 403, 429]) {
      status = code;
      await expect(credentials.use(f.route, () => Promise.resolve(true))).rejects.toMatchObject({
        reason: code === 429 ? 'rate_limited' : 'permission',
      });
    }
    expect(await credentials.webhookSecret('9', (key) => key.toString() === 's'.repeat(32))).toBe(true);
    await expect(credentials.webhookSecret('10', () => true)).rejects.toThrow('unavailable');
    const unsafeRoute = { ...f.route, repositoryId: '9007199254740993' };
    const unsafe = createGitHubCredentials({
      appId: '5',
      routes: [unsafeRoute],
      apiOrigin,
      allowLocalFixture: true,
      useSecret: async (_r, fn) => fn(secret),
    });
    const before = count;
    await expect(unsafe.use(unsafeRoute, () => Promise.resolve(true))).rejects.toThrow('unavailable');
    expect(count).toBe(before);
  } finally {
    secret.fill(0);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await f.close();
  }
});
it('TC-SF5-CONNECT-005 snapshots the bound installation and repository before delayed secret access', async () => {
  const f = await fixture(),
    keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let release!: () => void;
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const captured: { url: string; body: unknown }[] = [];
  const route = structuredClone(f.route);
  const credentials = createGitHubCredentials({
    appId: '5',
    routes: [route],
    clock: f.deps.clock!,
    useSecret: async (_r, fn) => {
      await barrier;
      return fn(
        Buffer.from(
          JSON.stringify({
            privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
            webhookSecret: 's'.repeat(32),
          }),
        ),
      );
    },
    fetch: (url, init) => {
      captured.push({
        url: url instanceof Request ? url.url : url.toString(),
        body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as unknown,
      });
      return Promise.resolve(
        Response.json({ token: 'fixture', expires_at: '2026-11-13T02:00:00Z', repositories: [{ id: 12 }] }),
      );
    },
  });
  try {
    const pending = credentials.use(route, () => Promise.resolve(true));
    route.installationId = '999';
    route.repositoryId = '888';
    release();
    expect(await pending).toBe(true);
    expect(captured[0]!.url).toContain('/installations/9/');
    expect(captured[0]!.body).toMatchObject({ repository_ids: [12] });
  } finally {
    await f.close();
  }
});
it('TC-SF5-CONNECT-010 no retry headers on rate limit uses one-minute fallback with fixed clock', async () => {
  const f = await fixture();
  try {
    const { createGitHubHttp } = await import('./http.js');
    const api = createGitHubHttp({
      credentials: f.deps.credentials,
      clock: f.deps.clock!,
      fetch: () => Promise.resolve(new Response('{}', { status: 429 })),
    });
    await expect(api.call(f.route, '/repos/test/repo')).rejects.toMatchObject({
      reason: 'rate_limited',
      retryAt: '2026-11-13T01:01:00.000Z',
    });
  } finally {
    await f.close();
  }
});
it('TC-SF5-CONNECT-010 safe rate/permission classifications survive a T008-style exception-scrubbing secret boundary', async () => {
  const f = await fixture(),
    keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const secret = Buffer.from(
    JSON.stringify({
      privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      webhookSecret: 's'.repeat(32),
    }),
  );
  let status = 429;
  const credentials = createGitHubCredentials({
    appId: '5',
    routes: [f.route],
    clock: f.deps.clock!,
    useSecret: async (_r, fn) => {
      try {
        return await fn(Buffer.from(secret));
      } catch {
        throw new Error('Gateway operation rejected or unavailable');
      }
    },
    fetch: () =>
      Promise.resolve(
        status === 201
          ? Response.json({ token: 'fixture', expires_at: '2026-11-13T02:00:00Z' })
          : new Response('{}', { status }),
      ),
  });
  try {
    await expect(credentials.use(f.route, () => Promise.resolve(true))).rejects.toMatchObject({
      reason: 'rate_limited',
    });
    status = 403;
    await expect(credentials.use(f.route, () => Promise.resolve(true))).rejects.toMatchObject({ reason: 'permission' });
    status = 503;
    await expect(credentials.use(f.route, () => Promise.resolve(true))).rejects.toMatchObject({
      reason: 'unavailable',
      definite: false,
    });
    status = 201;
    const { GitHubFailure } = await import('./http.js');
    await expect(
      credentials.use(f.route, () =>
        Promise.reject(new GitHubFailure('rate_limited', '2026-11-13T01:01:00.000Z', true)),
      ),
    ).rejects.toMatchObject({ reason: 'rate_limited' });
    await expect(credentials.use(f.route, () => Promise.reject(new Error('PRIVATE_KEY material')))).rejects.toThrow(
      'GitHub credential operation unavailable',
    );
  } finally {
    secret.fill(0);
    await f.close();
  }
});
