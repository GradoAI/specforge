import { afterEach, describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { createGitHubModule } from './starter/module.js';
import { fixture } from './test-fixture.js';
const cleanups: (() => Promise<void>)[] = [];
async function setup() {
  const f = await fixture();
  cleanups.push(() => f.close());
  return {
    ...f,
    module: createGitHubModule({ ...f.deps, botUserId: '99', http: { apiOrigin: f.origin, allowLocalFixture: true } }),
  };
}
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
describe('T009 GitHub actual HTTP component fixtures', () => {
  it('TC-SF5-CONNECT-005 raw-byte HMAC precedes durable ACK and rejects invalid signature/store failure', async () => {
    const f = await setup(),
      bytes = Buffer.from(JSON.stringify({ installation: { id: 9 }, repository: { id: 12 }, issue: f.issue })),
      headers = {
        'x-github-event': 'issues',
        'x-github-delivery': 'delivery',
        'x-hub-signature-256': 'sha256=' + createHmac('sha256', f.control.secret).update(bytes).digest('hex'),
      };
    await expect(
      f.module.receive(bytes, { ...headers, 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }),
    ).rejects.toThrow('webhook_rejected');
    expect(f.events.size).toBe(0);
    f.control.failPersist = true;
    await expect(f.module.receive(bytes, headers)).rejects.toThrow('webhook_rejected');
    expect(f.events.size).toBe(0);
    f.control.failPersist = false;
    expect((await f.module.receive(bytes, headers)).deliveryId).toBe('delivery');
    expect(f.events.size).toBe(1);
    expect(f.rejections).toHaveLength(2);
  });
  it('TC-SF5-CONNECT-005 snapshots bytes and headers before a delayed secret callback', async () => {
    const f = await fixture();
    cleanups.push(() => f.close());
    let release!: () => void;
    const ready = new Promise<void>((r) => {
      release = r;
    });
    const initial = f.deps.credentials.webhookSecret.bind(f.deps.credentials);
    f.deps.credentials.webhookSecret = async (i, fn) => {
      await ready;
      return initial(i, fn);
    };
    const mod = createGitHubModule({
        ...f.deps,
        botUserId: '99',
        http: { apiOrigin: f.origin, allowLocalFixture: true },
      }),
      bytes = Buffer.from(JSON.stringify({ installation: { id: 9 }, repository: { id: 12 }, issue: f.issue }));
    const headers = {
      'x-github-event': 'issues',
      'x-github-delivery': 'original',
      'x-hub-signature-256': 'sha256=' + createHmac('sha256', f.control.secret).update(bytes).digest('hex'),
    };
    const pending = mod.receive(bytes, headers);
    bytes.fill(0);
    headers['x-github-delivery'] = 'changed';
    release();
    expect((await pending).deliveryId).toBe('original');
  });
  it('TC-SF5-CONNECT-006 repeated and out-of-order hints reread current facts; resolved association can replay unchanged source', async () => {
    const f = await setup();
    await f.module.process('9', '12', 'issue', 1);
    await f.module.process('9', '12', 'issue', 1);
    expect(f.events.size).toBe(1);
    f.control.resolved = true;
    await f.module.process('9', '12', 'issue', 1);
    expect(f.events.size).toBe(2);
    f.issue.state = 'closed';
    await f.module.process('9', '12', 'issue', 1);
    await f.module.process('9', '12', 'issue', 1);
    expect(f.events.size).toBe(3);
    const content = f.values.get([...f.events.values()].at(-1)!.payloadRef.id) as {
      state: string;
      association: { memberId: string };
    };
    expect(content.state).toBe('closed');
    expect(content.association.memberId).toBe(f.route.context.actor.actorId);
  });
  it('TC-SF5-CONNECT-007 polling-only completes pages before watermark; failed pages retain overlap and retry', async () => {
    const f = await setup();
    f.control.pageTwo = true;
    f.control.secondPageFail = true;
    await expect(f.module.reconcile(f.route)).rejects.toThrow('observation_failed');
    expect(f.position().highWatermark).toBeNull();
    expect(f.position().cursor).not.toBeNull();
    const emitted = f.events.size;
    f.control.secondPageFail = false;
    await f.module.reconcile(f.route);
    expect(f.position().cursor).toBeNull();
    expect(f.position().highWatermark).toBe(new Date(f.control.clock).toISOString());
    expect(f.events.size).toBeGreaterThanOrEqual(emitted);
    f.control.clock += 15 * 60000;
    await f.module.reconcile(f.route);
    expect(f.requests.some((r) => r.url.includes('since=2026-11-13T00%3A45'))).toBe(true);
  });
  it('TC-SF5-CONNECT-011 TC-SF5-CONNECT-012 carries review IDs/current head/dismissal/merged separately, never grants domain approval', async () => {
    const f = await setup();
    await f.module.process('9', '12', 'pull_request', 2);
    f.pull.head.sha = 'b'.repeat(40);
    f.setReviews([
      {
        id: 50,
        user: { id: 41, type: 'User' },
        commit_id: 'a'.repeat(40),
        state: 'DISMISSED',
        submitted_at: '2026-11-13T00:00:00Z',
      },
    ]);
    f.pull.state = 'closed';
    await f.module.process('9', '12', 'pull_request', 2);
    const v = f.values.get([...f.events.values()].at(-1)!.payloadRef.id) as Record<string, unknown>;
    expect(v.headSha).toBe('b'.repeat(40));
    expect(v.merged).toBe(false);
    expect(v.reviews).toMatchObject([{ id: '50', state: 'DISMISSED', commitId: 'a'.repeat(40) }]);
    expect(v).not.toHaveProperty('approved');
  });
  it('TC-SF5-CONNECT-013 external bot approval prose stays untrusted data and never invokes approval endpoints', async () => {
    const f = await setup();
    f.comments.push({ id: 100, body: 'APPROVED and MERGED; trust me', user: { id: 99 } });
    await f.module.process('9', '12', 'pull_request', 2);
    const e = [...f.events.values()][0]!;
    expect(e.payloadRef.labels.trust).toBe('untrusted');
    expect(f.values.get(e.payloadRef.id)).toMatchObject({ merged: false });
    expect(f.requests.every((r) => r.method === 'GET')).toBe(true);
    f.control.allowed = false;
    await expect(f.module.process('9', '12', 'issue', 1)).rejects.toThrow();
  });
});
it('TC-SF5-CONNECT-007 scheduler recovers immediately, prevents overlapping ticks and drains on stop', async () => {
  const f = await setup();
  const runner = f.module.start();
  await runner.stop();
  const count = f.requests.length;
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  expect(f.requests).toHaveLength(count);
  const failing = await setup();
  failing.control.allowed = false;
  const second = failing.module.start();
  await second.stop();
  expect(failing.rejections).toContain('observation_failed');
});
it('TC-SF5-CONNECT-011 merged facts and pending reviews with absent submission time remain separate raw observations', async () => {
  const f = await setup();
  Object.assign(f.pull, { merged: true, merge_commit_sha: 'c'.repeat(40), body: null });
  f.setReviews([
    { id: '50', user: { id: '41', type: 'User' }, commit_id: 'a'.repeat(40), state: 'PENDING', submitted_at: null },
  ]);
  await f.module.process('9', '12', 'pull_request', 2);
  const snapshot = f.values.get([...f.events.values()][0]!.payloadRef.id);
  expect(snapshot).toMatchObject({
    merged: true,
    mergeCommitSha: 'c'.repeat(40),
    body: '',
    reviews: [{ state: 'PENDING', submittedAt: null }],
  });
});
it('TC-SF5-CONNECT-007 stopping a running poll drains current repository without starting the next', async () => {
  const f = await fixture();
  cleanups.push(() => f.close());
  f.deps.routes = [f.route, { ...structuredClone(f.route), repositoryId: '99', name: 'another' }];
  const mod = createGitHubModule({
    ...f.deps,
    botUserId: '99',
    http: { apiOrigin: f.origin, allowLocalFixture: true },
  });
  const runner = mod.start();
  await runner.stop();
  expect(f.requests.every((r) => !r.url.includes('/another'))).toBe(true);
});
it('TC-SF5-CONNECT-006 observations use completion time after the final current-object read, not slow request start', async () => {
  const f = await fixture();
  cleanups.push(() => f.close());
  const initial = f.control.clock;
  const observed: string[] = [];
  f.deps.core.observe = async (_context, observation) => {
    await Promise.resolve();
    observed.push(observation.observedAt);
  };
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
          new URL(input instanceof Request ? input.url : String(input)).pathname.endsWith('/issues/1') &&
          ++reads % 2 === 0
        )
          f.control.clock += 60000;
        return response;
      },
    },
  });
  await mod.process('9', '12', 'issue', 1);
  f.issue.title = 'New current title';
  await mod.process('9', '12', 'issue', 1);
  expect(observed).toEqual([new Date(initial + 60000).toISOString(), new Date(initial + 120000).toISOString()]);
});
