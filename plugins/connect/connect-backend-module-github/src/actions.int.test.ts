import { afterEach, it, expect } from 'vitest';
import { newId, type JsonValue } from '@fasrun/contracts-core';
import type { ExternalAction } from '@fasrun/plugin-connect-common';
import { createGitHubModule } from './starter/module.js';
import { digest } from './application/inbound.js';
import { fixture } from './test-fixture.js';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
async function setup(payload: JsonValue = { kind: 'comment', number: 1, body: 'Accepted work', purpose: 'accepted' }) {
  const f = await fixture();
  cleanups.push(() => f.close());
  const module = createGitHubModule({
    ...f.deps,
    botUserId: '99',
    http: { apiOrigin: f.origin, allowLocalFixture: true },
  });
  const action: ExternalAction = {
    version: 1,
    actionId: newId('act'),
    idempotencyKey: 'work:spec:ack:definitionhash',
    requestHash: digest(payload),
    integrationId: f.route.integrationId,
    kind: (payload as { kind: ExternalAction['kind'] }).kind,
    targetId: '12',
    payloadRef: f.ref('outbound', payload),
  };
  return { ...f, module, action };
}
it('TC-SF5-CONNECT-008 one accepted action produces exactly one visible acknowledgment under duplicate calls', async () => {
  const f = await setup();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.module.adapter.performAction(f.route.context, f.action)),
  );
  expect(results.some((r) => r.status === 'succeeded')).toBe(true);
  expect(f.comments).toHaveLength(1);
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(1);
});
it('TC-SF5-CONNECT-009 TC-CF-002 remote success before local result commit is recovered by marker without resending', async () => {
  const f = await setup();
  f.control.failSettle = true;
  await expect(f.module.adapter.performAction(f.route.context, f.action)).rejects.toThrow('outbound_failed');
  expect(f.comments).toHaveLength(1);
  expect(f.rows.get(f.action.actionId)?.result.status).toBe('unknown');
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(1);
});
it('TC-SF5-CONNECT-010 dropped response remains unknown then queries; 429 backs off and 403 is a failed outcome', async () => {
  const f = await setup();
  f.control.dropAfterCreate = true;
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('unknown');
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(1);
  const rate = await setup();
  rate.control.rate = true;
  expect((await rate.module.adapter.performAction(rate.route.context, rate.action)).status).toBe('pending');
  expect(rate.comments).toHaveLength(0);
  expect(rate.rows.get(rate.action.actionId)?.result.retryAt).toBeDefined();
  const denied = await setup();
  denied.control.permission = true;
  expect((await denied.module.adapter.performAction(denied.route.context, denied.action)).status).toBe('failed');
  expect(denied.comments).toHaveLength(0);
  expect(denied.outcomes).toContainEqual({ actionId: denied.action.actionId, reason: 'permission_denied' });
  expect(rate.outcomes).toContainEqual({ actionId: rate.action.actionId, reason: 'rate_limited' });
});
it('TC-SF5-SPEC-011 deterministic branch/marker recovers existing PR after response loss without duplicate PR', async () => {
  const f = await setup({
    kind: 'create_spec_pr',
    workId: 'work',
    layer: 'requirements',
    base: 'main',
    headSha: 'a'.repeat(40),
    title: 'Requirements',
    body: 'Review',
  });
  f.control.dropAfterCreate = true;
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('unknown');
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.control.prs).toHaveLength(1);
  expect(f.requests.filter((r) => r.method === 'POST' && r.url.endsWith('/pulls'))).toHaveLength(1);
  expect(f.requests.some((r) => r.url.includes('/merge'))).toBe(false);
});
it('TC-SF5-CONNECT-010 unknown without queryable effect never blindly sends; data hash and current management permission are rechecked', async () => {
  const f = await setup();
  await f.deps.actions.register(f.route.context, f.action);
  f.rows.get(f.action.actionId)!.result = { version: 1, actionId: f.action.actionId, status: 'unknown' };
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('unknown');
  expect(f.comments).toHaveLength(0);
  f.values.set(f.action.payloadRef.id, { kind: 'comment', number: 1, body: 'changed', purpose: 'accepted' });
  await expect(f.module.adapter.performAction(f.route.context, f.action)).rejects.toThrow('outbound_failed');
  const g = await setup();
  g.deps.authorize = (c) => Promise.resolve(c.permission !== 'integration.manage');
  const mod = createGitHubModule({
    ...g.deps,
    botUserId: '99',
    http: { apiOrigin: g.origin, allowLocalFixture: true },
  });
  await expect(mod.adapter.performAction({ ...g.route.context, permission: 'work.read' }, g.action)).rejects.toThrow(
    'outbound_failed',
  );
  expect(g.comments).toHaveLength(0);
});
it('TC-SF5-CONNECT-009 queryAction resolves actual unknown remote effect without a new send', async () => {
  const f = await setup();
  f.control.dropAfterCreate = true;
  await f.module.adapter.performAction(f.route.context, f.action);
  expect((await f.module.adapter.queryAction(f.route.context, f.action.actionId)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(1);
  expect((await f.module.adapter.queryAction(f.route.context, f.action.actionId)).status).toBe('succeeded');
  const empty = await setup();
  await empty.deps.actions.register(empty.route.context, empty.action);
  expect((await empty.module.adapter.queryAction(empty.route.context, empty.action.actionId)).status).toBe('pending');
  expect(empty.comments).toHaveLength(0);
  empty.control.permission = true;
  expect((await empty.module.adapter.queryAction(empty.route.context, empty.action.actionId)).status).toBe('failed');
});
it('TC-SF5-CONNECT-008 only app-owned markers count; edited or ambiguous markers cannot trigger a second effect', async () => {
  const f = await setup();
  const marker = `<!-- fasrun-action:${digest({ org: f.route.scope.orgId, key: f.action.idempotencyKey })} -->`;
  f.comments.push({ id: 98, body: `Accepted work\n\n${marker}`, user: { id: 40 } });
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(2);
  const edited = await setup();
  const m = `<!-- fasrun-action:${digest({ org: edited.route.scope.orgId, key: edited.action.idempotencyKey })} -->`;
  edited.comments.push({ id: 100, body: `human edited\n\n${m}`, user: { id: 99 } });
  expect((await edited.module.adapter.performAction(edited.route.context, edited.action)).status).toBe('failed');
  expect(edited.comments).toHaveLength(1);
  const duplicate = await setup();
  const d = `Accepted work\n\n<!-- fasrun-action:${digest({ org: duplicate.route.scope.orgId, key: duplicate.action.idempotencyKey })} -->`;
  duplicate.comments.push({ id: 1, body: d, user: { id: 99 } }, { id: 2, body: d, user: { id: 99 } });
  expect((await duplicate.module.adapter.performAction(duplicate.route.context, duplicate.action)).status).toBe(
    'failed',
  );
  expect(duplicate.comments).toHaveLength(2);
});
it('TC-SF5-CONNECT-010 protected update requires app ownership and old content hash; retry queries the updated body', async () => {
  const f = await setup({
    kind: 'update_comment',
    number: 1,
    commentId: '100',
    expectedBodyHash: digest('old'),
    body: 'Final result',
    purpose: 'result',
  });
  f.comments.push({ id: 100, body: 'old', user: { id: 99 } });
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(1);
  expect(f.comments[0]!.body).toContain('Final result');
  const changed = await setup({
    kind: 'update_comment',
    number: 1,
    commentId: '100',
    expectedBodyHash: digest('old'),
    body: 'Final',
    purpose: 'result',
  });
  changed.comments.push({ id: 100, body: 'manual edit', user: { id: 99 } });
  expect((await changed.module.adapter.performAction(changed.route.context, changed.action)).status).toBe('failed');
  expect(changed.comments[0]!.body).toBe('manual edit');
});
it('TC-SF5-SPEC-011 existing edited specification PR or unexpected branch head blocks replacement', async () => {
  const f = await setup({
    kind: 'create_spec_pr',
    workId: 'work',
    layer: 'requirements',
    base: 'main',
    headSha: 'a'.repeat(40),
    title: 'Requirements',
    body: 'Review',
  });
  f.control.prs.push({ id: 60, body: 'manual changes', user: { id: 99 }, head: f.pull.head, base: f.pull.base });
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('failed');
  expect(f.requests.some((r) => r.method === 'POST')).toBe(false);
  const changed = await setup({
    kind: 'create_spec_pr',
    workId: 'work',
    layer: 'requirements',
    base: 'main',
    headSha: 'b'.repeat(40),
    title: 'Requirements',
    body: 'Review',
  });
  expect((await changed.module.adapter.performAction(changed.route.context, changed.action)).status).toBe('failed');
  expect(changed.control.prs).toHaveLength(0);
});
it('TC-SF5-CONNECT-010 disallowed progress prose, forged markers, missing routes and excluded data fail before effects', async () => {
  for (const payload of [
    { kind: 'comment', number: 1, body: 'progress', purpose: 'progress' },
    { kind: 'comment', number: 1, body: '<!-- fasrun-action:forged -->', purpose: 'accepted' },
  ]) {
    const f = await setup(payload);
    await expect(f.module.adapter.performAction(f.route.context, f.action)).rejects.toThrow();
    expect(f.comments).toHaveLength(0);
  }
  const f = await setup();
  await expect(f.module.adapter.performAction(f.route.context, { ...f.action, targetId: '99' })).rejects.toThrow();
  f.action.payloadRef.labels.excludedChannels = ['github'];
  await expect(f.module.adapter.performAction(f.route.context, f.action)).rejects.toThrow();
  expect(f.comments).toHaveLength(0);
});
it('TC-SF5-CONNECT-010 unknown rate-limited recovery retains unknown and does not query again before retryAt', async () => {
  const f = await setup();
  await f.deps.actions.register(f.route.context, f.action);
  f.rows.get(f.action.actionId)!.result = { version: 1, actionId: f.action.actionId, status: 'unknown' };
  f.control.rate = true;
  const result = await f.module.adapter.performAction(f.route.context, f.action);
  expect(result.status).toBe('unknown');
  expect(result.retryAt).toBeDefined();
  const count = f.requests.length;
  await f.module.adapter.queryAction(f.route.context, f.action.actionId);
  expect(f.requests).toHaveLength(count);
  expect(f.comments).toHaveLength(0);
});
it('TC-SF5-CONNECT-010 direct query records rate, permission and unavailable reasons rather than false absence', async () => {
  const rate = await setup();
  await rate.deps.actions.register(rate.route.context, rate.action);
  rate.control.rate = true;
  const result = await rate.module.adapter.queryAction(rate.route.context, rate.action.actionId);
  expect(result.status).toBe('pending');
  expect(result.retryAt).toBeDefined();
  expect(rate.outcomes.at(-1)?.reason).toBe('rate_limited');
  const count = rate.requests.length;
  await rate.module.adapter.queryAction(rate.route.context, rate.action.actionId);
  expect(rate.requests).toHaveLength(count);
  const denied = await setup();
  await denied.deps.actions.register(denied.route.context, denied.action);
  denied.control.permission = true;
  expect((await denied.module.adapter.queryAction(denied.route.context, denied.action.actionId)).status).toBe('failed');
  expect(denied.outcomes.at(-1)?.reason).toBe('permission_denied');
  const missing = await setup();
  await missing.deps.actions.register(missing.route.context, missing.action);
  missing.control.allowed = false;
  expect((await missing.module.adapter.queryAction(missing.route.context, missing.action.actionId)).status).toBe(
    'pending',
  );
  expect(missing.outcomes.at(-1)?.reason).toBe('remote_unknown');
});
it('TC-SF5-CONNECT-010 known write rejection is failed, while denied historical-unknown lookup preserves uncertainty', async () => {
  const f = await setup();
  f.control.rejectWrite = true;
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('failed');
  expect(f.outcomes.at(-1)?.reason).toBe('request_rejected');
  expect(f.comments).toHaveLength(0);
  const unknown = await setup();
  await unknown.deps.actions.register(unknown.route.context, unknown.action);
  unknown.rows.get(unknown.action.actionId)!.result = {
    version: 1,
    actionId: unknown.action.actionId,
    status: 'unknown',
  };
  unknown.control.permission = true;
  expect((await unknown.module.adapter.queryAction(unknown.route.context, unknown.action.actionId)).status).toBe(
    'unknown',
  );
  expect(unknown.outcomes.at(-1)?.reason).toBe('permission_denied');
  expect(unknown.comments).toHaveLength(0);
});
it('TC-SF5-CONNECT-010 before-write read/token outages stay retryable and eventually send exactly once', async () => {
  const f = await setup();
  let fail = true;
  const mod = createGitHubModule({
    ...f.deps,
    botUserId: '99',
    http: {
      apiOrigin: f.origin,
      allowLocalFixture: true,
      fetch: (url, init) => {
        if (fail && (!init?.method || init.method === 'GET')) {
          fail = false;
          return Promise.resolve(new Response('{}', { status: 503 }));
        }
        return fetch(url, init);
      },
    },
  });
  expect((await mod.adapter.performAction(f.route.context, f.action)).status).toBe('pending');
  expect(f.comments).toHaveLength(0);
  expect((await mod.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(1);
  const token = await setup();
  let calls = 0;
  const original = token.deps.credentials.use.bind(token.deps.credentials);
  token.deps.credentials.use = (route, fn) => {
    if (++calls === 4) return Promise.reject(new Error('fixture token endpoint unavailable'));
    return original(route, fn);
  };
  const tokenMod = createGitHubModule({
    ...token.deps,
    botUserId: '99',
    http: { apiOrigin: token.origin, allowLocalFixture: true },
  });
  expect((await tokenMod.adapter.performAction(token.route.context, token.action)).status).toBe('pending');
  expect(token.comments).toHaveLength(0);
  expect((await tokenMod.adapter.performAction(token.route.context, token.action)).status).toBe('succeeded');
  expect(token.comments).toHaveLength(1);
});
it('TC-SF5-CONNECT-010 pending query429 permits one first send after backoff while historical unknown does not', async () => {
  const f = await setup();
  await f.deps.actions.register(f.route.context, f.action);
  f.control.rate = true;
  const r = await f.module.adapter.queryAction(f.route.context, f.action.actionId);
  expect(r.status).toBe('pending');
  f.control.rate = false;
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('pending');
  expect(f.comments).toHaveLength(0);
  f.control.clock += 31000;
  expect((await f.module.adapter.performAction(f.route.context, f.action)).status).toBe('succeeded');
  expect(f.comments).toHaveLength(1);
});
it('TC-SF5-CONNECT-009 malformed remote recovery ID cannot settle a fabricated success', async () => {
  const f = await setup();
  await f.deps.actions.register(f.route.context, f.action);
  f.rows.get(f.action.actionId)!.result = { version: 1, actionId: f.action.actionId, status: 'unknown' };
  const body = `Accepted work\n\n<!-- fasrun-action:${digest({ org: f.route.scope.orgId, key: f.action.idempotencyKey })} -->`;
  const mod = createGitHubModule({
    ...f.deps,
    botUserId: '99',
    http: {
      apiOrigin: f.origin,
      allowLocalFixture: true,
      fetch: (url, init) =>
        (url instanceof Request ? url.url : String(url)).includes('/comments')
          ? Promise.resolve(Response.json([{ body, user: { id: 99 } }]))
          : fetch(url, init),
    },
  });
  expect((await mod.adapter.queryAction(f.route.context, f.action.actionId)).status).toBe('unknown');
  expect(f.rows.get(f.action.actionId)!.result.externalId).toBeUndefined();
  expect(f.comments).toHaveLength(0);
});
