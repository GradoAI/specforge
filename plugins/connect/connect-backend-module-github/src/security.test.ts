import { createHmac } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { newId, type DataReference } from '@fasrun/contracts-core';
import { createGitHubModule } from './starter/module.js';
import { createGitHubHttp } from './infrastructure/http.js';
import { fixture } from './test-fixture.js';

const cleanups: (() => Promise<void>)[] = [];
async function setup() {
  const value = await fixture();
  cleanups.push(() => value.close());
  return value;
}
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
function moduleFor(f: Awaited<ReturnType<typeof fixture>>) {
  return createGitHubModule({ ...f.deps, botUserId: '99', http: { apiOrigin: f.origin, allowLocalFixture: true } });
}
function signed(
  f: Awaited<ReturnType<typeof fixture>>,
  payload: unknown = { installation: { id: 9 }, repository: { id: 12 }, issue: f.issue },
) {
  const bytes = Buffer.from(JSON.stringify(payload));
  const headers: Record<string, string> = {
    'x-github-event': 'issues',
    'x-github-delivery': 'security-delivery',
    'x-hub-signature-256': `sha256=${createHmac('sha256', f.control.secret).update(bytes).digest('hex')}`,
  };
  return { bytes, headers };
}

it('TC-SF5-CONNECT-005 malformed or oversized raw payloads cannot reach durable acceptance', async () => {
  const f = await setup(),
    mod = moduleFor(f);
  for (const bytes of [
    Buffer.from('{'),
    Buffer.from('null'),
    Buffer.from('[]'),
    Buffer.from('{}'),
    Buffer.alloc(262145),
  ]) {
    await expect(mod.receive(bytes, {})).rejects.toThrow('GitHub webhook_rejected');
  }
  expect(f.events.size).toBe(0);
  expect(f.requests).toHaveLength(0);
  expect(f.rejections).toEqual(Array.from({ length: 5 }, () => 'webhook_rejected'));
});

it.each([
  ['x-hub-signature-256', undefined],
  ['x-hub-signature-256', 'sha256=abc'],
  ['x-github-event', undefined],
  ['x-github-event', 'unsupported'],
  ['x-github-delivery', undefined],
  ['x-github-delivery', 'x'.repeat(201)],
] as const)('TC-SF5-CONNECT-005 rejects missing or invalid header %s=%s before ACK', async (key, value) => {
  const f = await setup(),
    request = signed(f);
  if (value === undefined) delete request.headers[key];
  else request.headers[key] = value;
  await expect(moduleFor(f).receive(request.bytes, request.headers)).rejects.toThrow('webhook_rejected');
  expect(f.events.size).toBe(0);
  expect(f.rejections).toEqual(['webhook_rejected']);
});

it('TC-SF5-CONNECT-005 requires a unique immutable installation/repository route and valid object identity', async () => {
  const f = await setup();
  for (const payload of [
    { installation: { id: 999 }, repository: { id: 12 }, issue: f.issue },
    { installation: { id: 9 }, repository: { id: 999 }, issue: f.issue },
    { installation: { id: -1 }, repository: { id: 12 }, issue: f.issue },
    { installation: { id: 9 }, repository: { id: 12 }, issue: { ...f.issue, id: 0 } },
    { installation: { id: 9 }, repository: { id: 12 }, issue: { ...f.issue, number: 0 } },
  ]) {
    const request = signed(f, payload);
    await expect(moduleFor(f).receive(request.bytes, request.headers)).rejects.toThrow('webhook_rejected');
  }
  f.deps.routes = [f.route, structuredClone(f.route)];
  const request = signed(f);
  await expect(moduleFor(f).receive(request.bytes, request.headers)).rejects.toThrow('webhook_rejected');
  expect(f.events.size).toBe(0);
});

it.each(['cross-org', 'agent', 'renamed-repository'] as const)(
  'TC-SF5-CONNECT-006 rejects unsafe configured identity: %s',
  async (mode) => {
    const f = await setup();
    if (mode === 'cross-org') f.route.context.actor.orgId = newId('org');
    if (mode === 'agent') f.route.context.actor.actorKind = 'agent';
    if (mode === 'renamed-repository') f.route.repositoryId = '13';
    await expect(moduleFor(f).process('9', f.route.repositoryId, 'issue', 1)).rejects.toThrow('observation_failed');
    expect(f.events.size).toBe(0);
    expect(f.rejections).toEqual(['observation_failed']);
    expect(f.position().highWatermark).toBeNull();
  },
);

it.each(['tenant', 'trust', 'source'] as const)(
  'TC-SF5-CONNECT-005 rejects external reference adapter violating %s labels',
  async (mode) => {
    const f = await setup(),
      original = f.deps.references.external.bind(f.deps.references);
    f.deps.references.external = async (...args) => {
      const ref: DataReference = await original(...args);
      if (mode === 'tenant') ref.orgId = newId('org');
      if (mode === 'trust') ref.labels.trust = 'trusted';
      if (mode === 'source') ref.labels.source = { kind: 'system', id: 'self-attested' };
      return ref;
    };
    await expect(moduleFor(f).process('9', '12', 'issue', 1)).rejects.toThrow('observation_failed');
    expect(f.events.size).toBe(0);
  },
);

it('TC-SF5-CONNECT-005 refuses a mismatched durable receipt instead of acknowledging another delivery', async () => {
  const f = await setup(),
    request = signed(f);
  f.deps.core.accept = () =>
    Promise.resolve({ version: 1, deliveryId: 'different', receiptId: 'receipt', persistedAt: '2026-11-13T00:00:00Z' });
  await expect(moduleFor(f).receive(request.bytes, request.headers)).rejects.toThrow('webhook_rejected');
  expect(f.rejections).toEqual(['webhook_rejected']);
});

it('TC-SF5-CONNECT-007 a listed object returning 404 does not advance the reconciliation watermark', async () => {
  const f = await setup();
  f.issue.number = 999;
  await expect(moduleFor(f).reconcile(f.route)).rejects.toThrow('observation_failed');
  expect(f.requests.some((request) => request.url === '/repos/test/repo/issues/999')).toBe(true);
  expect(f.position()).toEqual({ version: 1, cursor: null, highWatermark: null });
  expect(f.events.size).toBe(0);
});

it('TC-SF5-CONNECT-006 rejects changed current object facts across paginated reads', async () => {
  const f = await setup();
  let reads = 0;
  const mod = createGitHubModule({
    ...f.deps,
    botUserId: '99',
    http: {
      apiOrigin: f.origin,
      allowLocalFixture: true,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (
          new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname ===
            '/repos/test/repo/issues/1' &&
          ++reads === 1
        )
          f.issue.title = 'human changed while reading';
        return response;
      },
    },
  });
  await expect(mod.process('9', '12', 'issue', 1)).rejects.toThrow('observation_failed');
  expect(reads).toBe(2);
  expect(f.events.size).toBe(0);
});

it('TC-SF5-CONNECT-005 failed rejection audit cannot leak private errors or turn a denial into ACK', async () => {
  const f = await setup();
  f.deps.reject = () => Promise.reject(new Error('private audit transport credential'));
  await expect(moduleFor(f).receive(Buffer.from('{'), {})).rejects.toThrow('GitHub webhook_rejected');
  expect(f.events.size).toBe(0);
});

// Deliberate fetch protocol negatives: remote Link headers are controlled here, unlike the real HTTP cases above.
it.each(['foreign-origin', 'wrong-path', 'userinfo', 'cycle', 'not-array'] as const)(
  'TC-SF5-CONNECT-007 rejects unsafe pagination protocol: %s',
  async (mode) => {
    const f = await setup(),
      requests: string[] = [];
    const links = {
      'foreign-origin': 'https://foreign.invalid/repos/test/repo/issues?page=2',
      'wrong-path': `${f.origin}/repos/test/other/issues?page=2`,
      userinfo: `${f.origin.replace('http://', 'http://user:secret@')}/repos/test/repo/issues?page=2`,
      cycle: `${f.origin}/repos/test/repo/issues`,
      'not-array': '',
    };
    const http = createGitHubHttp({
      credentials: f.deps.credentials,
      apiOrigin: f.origin,
      allowLocalFixture: true,
      fetch: (input) => {
        requests.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        return Promise.resolve(
          new Response(mode === 'not-array' ? '{}' : '[]', {
            status: 200,
            headers: links[mode] ? { link: `<${links[mode]}>; rel="next"` } : {},
          }),
        );
      },
    });
    await expect(
      (async () => {
        for await (const page of http.pages(f.route, '/repos/test/repo/issues')) expect(page).toEqual([]);
      })(),
    ).rejects.toThrow('invalid_response');
    expect(requests).toEqual([`${f.origin}/repos/test/repo/issues`]);
    expect(f.events.size).toBe(0);
  },
);
