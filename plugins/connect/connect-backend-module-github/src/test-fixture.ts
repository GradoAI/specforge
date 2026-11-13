/** Controlled HTTP/port fixture for T009 component tests; no claim of a deployed CORE or real GitHub installation. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { newId, type DataReference, type JsonValue } from '@fasrun/contracts-core';
import type { ConnectActionState, GitHubRepositoryRoute } from '@fasrun/plugin-connect-node';
import type { ExternalAction, ActionResult, InboxEvent } from '@fasrun/plugin-connect-common';
import type { GitHubDependencies } from './application/ports.js';
import { digest } from './application/inbound.js';
export async function fixture() {
  const orgId = newId('org'),
    actorId = newId('mem'),
    route: GitHubRepositoryRoute = {
      integrationId: newId('int'),
      installationId: '9',
      repositoryId: '12',
      owner: 'test',
      name: 'repo',
      scope: { orgId, teamId: newId('tem'), projectId: newId('prj') },
      context: {
        actor: {
          version: 1,
          actorId,
          actorKind: 'member',
          orgId,
          clientId: 'test',
          source: 'internal',
          traceId: 'trace',
        },
        scope: { orgId },
        permission: 'integration.manage',
        object: { type: 'repository', id: '12' },
      },
    };
  const events = new Map<string, InboxEvent>(),
    values = new Map<string, JsonValue>(),
    requests: { method: string; url: string; body: unknown }[] = [],
    rejections: string[] = [],
    comments: { id: number; body: string; user: { id: number } }[] = [];
  const issue = {
    id: 20,
    number: 1,
    title: 'request',
    body: 'please help',
    state: 'open',
    updated_at: '2026-11-13T00:00:00Z',
    user: { id: 40, type: 'User' },
  };
  const pull = {
    ...issue,
    id: 21,
    number: 2,
    head: { sha: 'a'.repeat(40), ref: 'fasrun/spec/work/requirements', repo: { id: 12 } },
    base: { ref: 'main' },
    merged: false,
    merge_commit_sha: null,
  };
  let reviews: unknown[] = [
    {
      id: 50,
      user: { id: 41, type: 'User' },
      commit_id: 'a'.repeat(40),
      state: 'APPROVED',
      submitted_at: '2026-11-13T00:00:00Z',
    },
  ];
  const outcomes: { actionId: string; reason: string }[] = [];
  const control = {
    allowed: true,
    rejectWrite: false,
    resolved: false,
    failPersist: false,
    failSettle: false,
    dropAfterCreate: false,
    permission: false,
    rate: false,
    secondPageFail: false,
    pageTwo: false,
    clock: Date.parse('2026-11-13T01:00:00Z'),
    prs: [] as unknown[],
    secret: 's'.repeat(32),
  };
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      res.writeHead(500);
      res.end('{}');
    });
  });
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));
    const text = Buffer.concat(chunks).toString();
    const body: { body?: string } = text ? (JSON.parse(text) as { body?: string }) : {};
    const url = new URL(req.url!, 'http://fixture');
    requests.push({ method: req.method!, url: req.url!, body });
    const reply = (v: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(v));
    };
    if (control.rejectWrite && req.method === 'POST') return reply({}, 422);
    if (control.permission) return reply({ message: 'secret must never escape' }, 403);
    if (control.rate) {
      res.setHeader('retry-after', '30');
      return reply({}, 429);
    }
    if (url.pathname === '/repos/test/repo') return reply({ id: 12 });
    if (url.pathname === '/repos/test/repo/issues' && req.method === 'GET') {
      if (url.searchParams.get('page') === '2') {
        if (control.secondPageFail) return reply({}, 503);
        return reply([]);
      }
      if (control.pageTwo)
        res.setHeader(
          'link',
          `<http://127.0.0.1:${(server.address() as { port: number }).port}${url.pathname}?page=2>; rel="next"`,
        );
      return reply([issue]);
    }
    if (url.pathname === '/repos/test/repo/issues/1') return reply(issue);
    if (url.pathname === '/repos/test/repo/pulls/2') return reply(pull);
    if (url.pathname === '/repos/test/repo/pulls/2/reviews') return reply(reviews);
    if (url.pathname === '/repos/test/repo/pulls') {
      if (req.method === 'POST') {
        const value = { id: 60, user: { id: 99 }, body: body.body ?? '', head: pull.head, base: pull.base };
        control.prs.push(value);
        if (control.dropAfterCreate) {
          control.dropAfterCreate = false;
          req.socket.destroy();
          return;
        }
        return reply(value, 201);
      }
      return reply(url.searchParams.has('head') ? control.prs : [pull]);
    }
    if (url.pathname === '/repos/test/repo/git/ref/heads/fasrun/spec/work/requirements')
      return reply({ object: { sha: pull.head.sha } });
    if (/^\/repos\/test\/repo\/issues\/[12]\/comments$/.test(url.pathname)) {
      if (req.method === 'POST') {
        const value = { id: 100 + comments.length, body: body.body ?? '', user: { id: 99 } };
        comments.push(value);
        if (control.dropAfterCreate) {
          control.dropAfterCreate = false;
          req.socket.destroy();
          return;
        }
        return reply(value, 201);
      }
      return reply(comments);
    }
    if (/^\/repos\/test\/repo\/issues\/comments\/[0-9]+$/.test(url.pathname)) {
      const comment = comments.find((c) => String(c.id) === url.pathname.split('/').at(-1));
      if (!comment) return reply({}, 404);
      if (req.method === 'PATCH') comment.body = body.body ?? '';
      return reply({ ...comment, issue_url: 'https://api.github.com/repos/test/repo/issues/1' });
    }
    return reply({}, 404);
  }
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const rows = new Map<string, { action: ExternalAction; result: ActionResult; token: string | null }>();
  let position = { version: 1, cursor: null as string | null, highWatermark: null as string | null };
  const actions: ConnectActionState = {
    async register(_c, a) {
      await Promise.resolve();
      const previous = [...rows.values()].find((x) => x.action.idempotencyKey === a.idempotencyKey);
      if (previous) {
        if (digest(previous.action) !== digest(a)) throw new Error('conflict');
        return previous.result;
      }
      const result: ActionResult = { version: 1, actionId: a.actionId, status: 'pending' };
      rows.set(a.actionId, { action: structuredClone(a), result, token: null });
      return result;
    },
    async claim(_c, id) {
      await Promise.resolve();
      const row = rows.get(id)!;
      if (
        row.token ||
        row.result.status === 'succeeded' ||
        row.result.status === 'failed' ||
        (row.result.retryAt && Date.parse(row.result.retryAt) > control.clock)
      )
        return { ...row, leaseToken: null, dispatch: false };
      const dispatch = row.result.status === 'pending';
      row.result = { version: 1, actionId: id, status: 'unknown' };
      row.token = 'lease';
      return { action: row.action, result: row.result, leaseToken: row.token, dispatch };
    },
    async settle(_c, id, token, result) {
      await Promise.resolve();
      const row = rows.get(id)!;
      if (control.failSettle) {
        control.failSettle = false;
        row.token = null;
        throw new Error('injected commit failure');
      }
      if (row.token !== token) throw new Error('stale');
      row.result = result;
      row.token = null;
    },
    async query(_c, id) {
      await Promise.resolve();
      return rows.get(id)!.result;
    },
    async position() {
      await Promise.resolve();
      return { ...position };
    },
    async checkpoint(_c, _i, _r, previous, next) {
      await Promise.resolve();
      if (previous.version !== position.version) throw new Error('conflict');
      position = { ...next, version: position.version + 1 };
      return { ...position };
    },
  };
  function ref(source: string, data: JsonValue): DataReference {
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      id = `ref://connect/github/${source.replace(/[^A-Za-z0-9_-]/g, '_')}@${hash}`;
    values.set(id, structuredClone(data));
    return {
      version: 1,
      id,
      orgId,
      ownerPlugin: 'connect',
      versionHash: hash,
      labels: {
        trust: 'untrusted',
        source: { kind: 'external', id: source },
        readScopes: [route.scope],
        classification: 'internal',
        excludedChannels: [],
      },
    };
  }
  const deps: GitHubDependencies = {
    outcome: async (_c, v) => {
      await Promise.resolve();
      outcomes.push(v);
    },
    routes: [route],
    actions,
    clock: () => new Date(control.clock),
    authorize: () => Promise.resolve(control.allowed),
    reject: async (r) => {
      await Promise.resolve();
      rejections.push(r);
    },
    credentials: {
      use: async (_r, fn) => fn('fixture-only-token'),
      webhookSecret: (_i, fn) => Promise.resolve(fn(Buffer.from(control.secret))),
    },
    references: {
      external: (_r, id, data) => Promise.resolve(ref(id, data)),
      read: (_c, r) => Promise.resolve(structuredClone(values.get(r.id)!)),
      outbound: async (_c, r) => {
        await Promise.resolve();
        if (r.labels.excludedChannels.includes('github') || !control.allowed) throw new Error('denied');
        return structuredClone(values.get(r.id)!);
      },
    },
    resolveExternal: () =>
      Promise.resolve(control.resolved ? { kind: 'resolved', memberId: actorId } : { kind: 'unresolved' }),
    core: {
      async accept(_c, _r, event) {
        await Promise.resolve();
        if (control.failPersist) throw new Error('injected');
        const old = events.get(event.deliveryId);
        if (old && old.payloadRef.id !== event.payloadRef.id) throw new Error('conflicting payload');
        events.set(event.deliveryId, structuredClone(event));
        return {
          version: 1,
          deliveryId: event.deliveryId,
          receiptId: event.deliveryId,
          persistedAt: '2026-11-13T01:00:00Z',
        };
      },
      async observe() {},
    },
  };
  return {
    deps,
    route,
    outcomes,
    control,
    events,
    values,
    requests,
    rejections,
    comments,
    issue,
    pull,
    rows,
    ref,
    origin,
    setReviews: (v: unknown[]) => {
      reviews = v;
    },
    position: () => position,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    },
  };
}
