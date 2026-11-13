import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { newId, type OperationContext } from '@fasrun/contracts-core';
import { migrateDatabase } from '@fasrun/backend-defaults';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import type { ExternalAction } from '@fasrun/plugin-connect-common';
import { createConnectCore } from '../../starter/services.js';
import { createConnectActionState } from '../../starter/actions.js';

const orgId = newId('org'),
  otherOrg = newId('org'),
  integrationId = newId('int'),
  repositoryId = '12345';
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: 'manager',
    actorKind: 'member',
    orgId,
    clientId: 'fixture',
    source: 'internal',
    traceId: 'actions-test',
  },
  permission: 'integration.manage',
  scope: { orgId, teamId: 'team', projectId: 'project' },
  object: { type: 'repository', id: repositoryId },
};
function action(): ExternalAction {
  return {
    version: 1,
    actionId: newId('act'),
    idempotencyKey: `${newId('wrk')}:segment:step:${'a'.repeat(64)}`,
    requestHash: 'b'.repeat(64),
    integrationId,
    kind: 'comment',
    targetId: repositoryId,
    payloadRef: {
      version: 1,
      id: `ref://connect/outbound/payload@${'c'.repeat(64)}`,
      orgId,
      ownerPlugin: 'connect',
      versionHash: 'c'.repeat(64),
      labels: {
        source: { kind: 'system', id: 'fixture' },
        trust: 'trusted',
        readScopes: [{ orgId }],
        classification: 'internal',
        excludedChannels: [],
      },
    },
  };
}
describe('T009 persisted action recovery and reconciliation boundaries', () => {
  let database: TestDatabase, owner: pg.Pool, app: pg.Pool;
  const ended: Promise<void>[] = [],
    errors: string[] = [],
    audits: string[] = [];
  let allowed = true,
    auditFails = false;
  const audit = {
    audit: (event: { eventId: string; outcome: string }) => {
      if (auditFails) return Promise.reject(new Error('private audit failure'));
      audits.push(event.outcome);
      return Promise.resolve({ eventId: event.eventId, sequence: 1, hash: 'd'.repeat(64) });
    },
  };
  function state(authorize: (actual: OperationContext) => Promise<boolean> = () => Promise.resolve(allowed)) {
    return createConnectActionState({ pool: app, authority: { authorize }, audit, leaseMs: 30000 });
  }
  beforeAll(async () => {
    database = await createTestDatabase(inject('fasrunPostgres'));
    await migrateDatabase({
      connectionString: database.ownerUrl,
      plugins: [
        { schema: 'connect', migrationsDirectory: fileURLToPath(new URL('../../../migrations/', import.meta.url)) },
      ],
    });
    owner = new pg.Pool({ connectionString: database.ownerUrl });
    app = new pg.Pool({ connectionString: database.appUrl });
    for (const pool of [owner, app]) {
      pool.on('connect', (client) => ended.push(new Promise<void>((resolve) => client.once('end', resolve))));
      pool.on('error', () => errors.push('Pool error'));
    }
    await createConnectCore({
      pool: app,
      authority: { authorize: () => Promise.resolve(true) },
      audit,
    }).service.configure(
      context,
      { id: integrationId, orgId, installationId: '67890', provider: 'github', active: true },
      {
        id: newId('rpb'),
        integrationId,
        repositoryId,
        scope: { orgId, teamId: 'team', projectId: 'project' },
        active: true,
      },
    );
  });
  beforeEach(() => {
    allowed = true;
    auditFails = false;
  });
  afterAll(async () => {
    try {
      await Promise.all([owner?.end(), app?.end()]);
      await Promise.all(ended);
    } finally {
      await database?.drop();
    }
    expect(errors).toEqual([]);
  });

  it('TC-SF5-CONNECT-008 registers concurrent identical actions once and refuses changed requests', async () => {
    const input = action();
    const receipts = await Promise.all(Array.from({ length: 5 }, () => state().register(context, input)));
    expect(receipts).toEqual(
      Array.from({ length: 5 }, () => ({ version: 1, actionId: input.actionId, status: 'pending' })),
    );
    expect(
      (await owner.query('select id from connect.outbound_action where id=$1', [input.actionId])).rows,
    ).toHaveLength(1);
    expect(
      (
        await owner.query(
          "select event from connect.outbox where event->>'topic'='connect.action.changed' and event->'payload'->>'actionId'=$1",
          [input.actionId],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(state().register(context, { ...input, requestHash: 'e'.repeat(64) })).rejects.toThrow('unavailable');
    await expect(state().register(context, { ...input, actionId: newId('act') })).rejects.toThrow('unavailable');
    expect(await state().query(context, input.actionId)).toEqual(receipts[0]);
  });

  it('TC-SF5-CONNECT-008 leases one sender and makes an expired uncertain action query-only', async () => {
    const input = action();
    await state().register(context, input);
    const claims = await Promise.all([state().claim(context, input.actionId), state().claim(context, input.actionId)]);
    const sender = claims.find((value) => value.leaseToken)!;
    expect(claims.filter((value) => value.leaseToken)).toHaveLength(1);
    expect(sender.dispatch).toBe(true);
    expect(sender.result.status).toBe('unknown');
    expect(claims.filter((value) => value.dispatch)).toHaveLength(1);
    await owner.query("update connect.outbound_action set lease_until=now()-interval '1 second' where id=$1", [
      input.actionId,
    ]);
    const recovered = await state().claim(context, input.actionId);
    expect(recovered.leaseToken).toBeTruthy();
    expect(recovered.dispatch).toBe(false);
    await expect(
      state().settle(context, input.actionId, sender.leaseToken!, {
        version: 1,
        actionId: input.actionId,
        status: 'succeeded',
        externalId: '100',
      }),
    ).rejects.toThrow('unavailable');
    await state().settle(context, input.actionId, recovered.leaseToken!, {
      version: 1,
      actionId: input.actionId,
      status: 'succeeded',
      externalId: '100',
    });
    expect(await state().query(context, input.actionId)).toMatchObject({ status: 'succeeded', externalId: '100' });
    expect(await state().claim(context, input.actionId)).toMatchObject({ leaseToken: null, dispatch: false });
  });

  it('TC-CF-002 / TC-SF5-CONNECT-008 failed local result commit retains unknown for recovery without a second send', async () => {
    const input = action();
    await state().register(context, input);
    const claimed = await state().claim(context, input.actionId);
    // Remote marker lookup is tested by the module. Here a fixed remote receipt already exists.
    const remoteReceipt = 'remote-effect-100';
    await owner.query('alter table connect.outbox add constraint ck_action_fault check(false) not valid');
    try {
      await expect(
        state().settle(context, input.actionId, claimed.leaseToken!, {
          version: 1,
          actionId: input.actionId,
          status: 'succeeded',
          externalId: remoteReceipt,
        }),
      ).rejects.toThrow('unavailable');
      const another = action();
      await expect(state().register(context, another)).rejects.toThrow('unavailable');
      expect(
        (await owner.query('select id from connect.outbound_action where id=$1', [another.actionId])).rows,
      ).toEqual([]);
    } finally {
      await owner.query('alter table connect.outbox drop constraint ck_action_fault');
    }
    expect(await state().query(context, input.actionId)).toMatchObject({ status: 'unknown' });
    await owner.query("update connect.outbound_action set lease_until=now()-interval '1 second' where id=$1", [
      input.actionId,
    ]);
    const resumed = await state().claim(context, input.actionId);
    expect(resumed.dispatch).toBe(false);
    await state().settle(context, input.actionId, resumed.leaseToken!, {
      version: 1,
      actionId: input.actionId,
      status: 'succeeded',
      externalId: remoteReceipt,
    });
    expect((await state().query(context, input.actionId)).externalId).toBe(remoteReceipt);
  });

  it('TC-SF5-CONNECT-009 respects retry time and rechecks current permissions, audit and repository binding', async () => {
    const input = action();
    await state().register(context, input);
    const claimed = await state().claim(context, input.actionId);
    await state().settle(context, input.actionId, claimed.leaseToken!, {
      version: 1,
      actionId: input.actionId,
      status: 'pending',
      retryAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(await state().claim(context, input.actionId)).toMatchObject({ leaseToken: null, dispatch: false });
    await owner.query("update connect.outbound_action set retry_at=now()-interval '1 second' where id=$1", [
      input.actionId,
    ]);
    expect(await state().claim(context, input.actionId)).toMatchObject({ dispatch: true });
    allowed = false;
    await expect(state().query(context, input.actionId)).rejects.toThrow('unavailable');
    expect(audits).toContain('denied');
    allowed = true;
    auditFails = true;
    await expect(state().query(context, input.actionId)).rejects.toThrow('unavailable');
    auditFails = false;
    await owner.query('update connect.repository_binding set active=false where integration_id=$1', [integrationId]);
    try {
      await expect(state().query(context, input.actionId)).rejects.toThrow('unavailable');
    } finally {
      await owner.query('update connect.repository_binding set active=true where integration_id=$1', [integrationId]);
    }
    const cross = { ...context, actor: { ...context.actor, orgId: otherOrg }, scope: { orgId: otherOrg } };
    await expect(state().query(cross, input.actionId)).rejects.toThrow('unavailable');
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [otherOrg]);
      expect((await client.query('select id from connect.outbound_action')).rows).toEqual([]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('TC-SF5-CONNECT-006 incomplete pages retain watermark and concurrent stale checkpoints are rejected', async () => {
    const initial = await state().position(context, integrationId, repositoryId);
    const first = await state().checkpoint(context, integrationId, repositoryId, initial, {
      cursor: 'page:1',
      highWatermark: initial.highWatermark,
    });
    await expect(
      state().checkpoint(context, integrationId, repositoryId, initial, {
        cursor: null,
        highWatermark: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('unavailable');
    await expect(
      state().checkpoint(context, integrationId, repositoryId, first, {
        cursor: 'page:2',
        highWatermark: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('unavailable');
    expect(await state().position(context, integrationId, repositoryId)).toEqual(first);
    const complete = await state().checkpoint(context, integrationId, repositoryId, first, {
      cursor: null,
      highWatermark: '2026-01-01T00:00:00.000Z',
    });
    await expect(
      state().checkpoint(context, integrationId, repositoryId, complete, {
        cursor: null,
        highWatermark: '2025-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('unavailable');
    expect((await state().position(context, integrationId, repositoryId)).highWatermark).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('TC-SF5-CONNECT-006 snapshots a checked page before asynchronous authorization', async () => {
    const previous = await state().position(context, integrationId, repositoryId);
    const next = { cursor: 'page:still-incomplete' as string | null, highWatermark: previous.highWatermark };
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = state(async () => {
      entered();
      await barrier;
      return true;
    });
    const pending = service.checkpoint(context, integrationId, repositoryId, previous, next);
    await ready;
    next.cursor = null;
    next.highWatermark = '2099-01-01T00:00:00.000Z';
    previous.version += 100;
    release();
    const saved = await pending;
    expect(saved.cursor).toBe('page:still-incomplete');
    expect(saved.highWatermark).not.toBe('2099-01-01T00:00:00.000Z');
    expect(await state().position(context, integrationId, repositoryId)).toEqual(saved);
  });
});
