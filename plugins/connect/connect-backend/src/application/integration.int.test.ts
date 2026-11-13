import { decidePermission, defaultRules } from '@fasrun/plugin-identity-common';
import { createConnectAuthority } from '../infrastructure/authority.js';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect, inject } from 'vitest';
import { newId, type OperationContext } from '@fasrun/contracts-core';
import { migrateDatabase } from '@fasrun/backend-defaults';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import type { InboxEvent, Integration, RepositoryBinding } from '@fasrun/plugin-connect-common';
import { createConnectCore, createConnectGateway } from '../starter/services.js';
const orgId = newId('org'),
  other = newId('org'),
  integrationId = newId('int'),
  repositoryId = 'repository-123';
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: 'admin',
    actorKind: 'member',
    orgId,
    clientId: 'test',
    source: 'internal',
    traceId: 'trace',
  },
  permission: 'integration.manage',
  scope: { orgId, teamId: 'team', projectId: 'project' },
  object: { type: 'integration', id: integrationId },
};
const integration: Integration = {
  id: integrationId,
  orgId,
  installationId: 'installation-123',
  provider: 'github',
  active: true,
};
const binding: RepositoryBinding = {
  id: newId('rpb'),
  integrationId,
  repositoryId,
  scope: { orgId, teamId: 'team', projectId: 'project' },
  active: true,
};
function event(deliveryId = newId('evt')): InboxEvent {
  return {
    version: 1,
    orgId,
    installationId: integration.installationId,
    deliveryId,
    externalObjectId: 'issue-123',
    eventType: 'issues',
    receivedAt: new Date().toISOString(),
    signatureVerified: true,
    payloadRef: {
      version: 1,
      id: `ref://connect/inbox/payload@${'a'.repeat(64)}`,
      orgId,
      ownerPlugin: 'connect',
      versionHash: 'a'.repeat(64),
      labels: {
        trust: 'untrusted',
        source: { kind: 'external', id: 'github' },
        readScopes: [{ orgId }],
        classification: 'internal',
        excludedChannels: [],
      },
    },
  };
}
describe('T008 real CORE state and isolated gateway', () => {
  let db: TestDatabase, owner: pg.Pool, app: pg.Pool;
  const ended: Promise<void>[] = [],
    errors: string[] = [];
  let allowed = true;
  const audited: string[] = [];
  function core() {
    return createConnectCore({
      pool: app,
      authority: createConnectAuthority({
        authorize: (actual) =>
          Promise.resolve(
            decidePermission(
              actual,
              {
                id: 'admin',
                orgId,
                active: allowed,
                issuer: 'issuer',
                subject: 'subject',
                sessionVersion: 1,
                teamIds: ['team'],
                groupIds: [],
              },
              [{ id: 'grant', memberId: 'admin', role: 'platform_admin', scope: { orgId } }],
              defaultRules(orgId),
              {
                conditions: {},
                triggerId: 'external',
                proposerId: 'external',
                applicantId: 'external',
                machineOwnerId: 'manager',
                requirementsReviewerIds: [],
                allowRequirementsTrigger: false,
                allowMergeRequirementsReviewer: false,
                independentReviewerIds: [],
                constraints: { 'integration.manage': true },
              },
            ),
          ),
      }),
      audit: {
        audit: (e) => {
          audited.push(e.outcome);
          return Promise.resolve({ eventId: e.eventId, sequence: 1, hash: 'a'.repeat(64) });
        },
      },
    });
  }
  beforeAll(async () => {
    db = await createTestDatabase(inject('fasrunPostgres'));
    await migrateDatabase({
      connectionString: db.ownerUrl,
      plugins: [
        { schema: 'connect', migrationsDirectory: fileURLToPath(new URL('../../migrations/', import.meta.url)) },
      ],
    });
    owner = new pg.Pool({ connectionString: db.ownerUrl });
    app = new pg.Pool({ connectionString: db.appUrl });
    for (const pool of [owner, app]) {
      pool.on('connect', (c) => ended.push(new Promise<void>((resolve) => c.once('end', resolve))));
      pool.on('error', () => errors.push('Pool error'));
    }
    await owner.query('create schema test_private');
    await owner.query('create table test_private.probe(value text)');
    await core().service.configure(context, integration, binding);
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), app?.end()]);
    await Promise.all(ended);
    await db?.drop();
    expect(errors).toEqual([]);
  });
  it('TC-SF5-CONNECT-001 persists ownership and source while exposing no work/gate write', async () => {
    const source = event();
    await expect(
      core().service.accept(context, repositoryId, {
        ...source,
        payloadRef: { ...source.payloadRef, labels: { ...source.payloadRef.labels, trust: 'trusted' } },
      }),
    ).rejects.toThrow('unavailable');
    await expect(
      core().service.accept(context, repositoryId, {
        ...source,
        payloadRef: {
          ...source.payloadRef,
          labels: { ...source.payloadRef.labels, source: { kind: 'agent', id: 'agent' } },
        },
      }),
    ).rejects.toThrow('unavailable');
    const a = await core().service.accept(context, repositoryId, source);
    const b = await core().service.accept(context, repositoryId, source);
    expect(b).toEqual(a);
    expect(Object.keys(core().service)).not.toContain('approve');
    const object = {
      id: newId('ext'),
      integrationId,
      repositoryId,
      externalId: 'issue-123',
      kind: 'issue' as const,
      observedAt: new Date().toISOString(),
      digest: 'a'.repeat(64),
    };
    await core().service.observe(context, object);
    await core().service.observe(context, {
      ...object,
      observedAt: new Date(Date.now() - 100000).toISOString(),
      digest: 'b'.repeat(64),
    });
    expect(
      (await owner.query<{ digest: string }>('select digest from connect.external_object where id=$1', [object.id]))
        .rows[0]!.digest,
    ).toBe(object.digest);
    await core().service.configure(context, integration, {
      ...binding,
      id: newId('rpb'),
      repositoryId: 'other-repository',
    });
    await expect(core().service.observe(context, { ...object, repositoryId: 'other-repository' })).rejects.toThrow(
      'unavailable',
    );

    expect((await owner.query('select * from connect.inbox where id=$1', [a.receiptId])).rows).toHaveLength(1);
    expect(
      (
        await owner.query(
          "select * from connect.outbox where event->>'topic'='connect.inbox.accepted' and event->'payload'->>'receiptId'=$1",
          [a.receiptId],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('TC-SF5-CONNECT-002 rejects revoked/current permission, unknown installation, repository and tenant', async () => {
    allowed = false;
    await expect(core().service.configure(context, integration, binding)).rejects.toThrow('rejected');
    allowed = true;
    expect(audited).toContain('denied');
    await expect(core().service.accept(context, 'unbound', event())).rejects.toThrow('rejected');
    await expect(core().service.accept(context, repositoryId, { ...event(), installationId: 'wrong' })).rejects.toThrow(
      'rejected',
    );
    await expect(
      core().service.accept(
        { ...context, actor: { ...context.actor, orgId: other }, scope: { orgId: other } },
        repositoryId,
        event(),
      ),
    ).rejects.toThrow('rejected');
    await expect(app.query('select * from test_private.probe')).rejects.toMatchObject({ code: '42501' });
    const c = await app.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('fasrun.org_id',$1,true)", [other]);
      expect((await c.query('select * from connect.integration')).rows).toEqual([]);
      await expect(
        c.query(
          "insert into connect.integration(id,org_id,created_by,installation_id,provider,active) values($1,$2,'x','x','github',true)",
          [newId('int'), orgId],
        ),
      ).rejects.toThrow();
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
  it('TC-SF5-CONNECT-003 encrypts only in gateway, validates rotations and rejects stale CAS', async () => {
    const keys = new Map([
      ['key1', Buffer.alloc(32, 1)],
      ['key2', Buffer.alloc(32, 2)],
    ]);
    let active = 'key1',
      valid = true;
    const gateway = createConnectGateway({
      core: core().service,
      keys: {
        activeVersion: () => active,
        key: (v) => {
          const key = keys.get(v);
          if (!key) throw new Error('Key unavailable');
          return key;
        },
      },
      authorize: () => Promise.resolve(allowed),
      verify: () => Promise.reject(new Error('unused')),
      validateCredential: () => (valid ? Promise.resolve() : Promise.reject(new Error('secret credential error'))),
    });
    const secret = Buffer.from('test-credential-private-material');
    await gateway.rotate(context, integrationId, 'v1', secret, null);
    expect(await gateway.useCredential(context, integrationId, (value) => Promise.resolve(value.equals(secret)))).toBe(
      true,
    );
    active = 'key2';
    valid = false;
    await expect(gateway.rotate(context, integrationId, 'v2', Buffer.from('replacement'), 'v1')).rejects.toThrow(
      'unavailable',
    );
    expect((await core().service.credential(context, integrationId)).credentialVersion).toBe('v1');
    valid = true;
    await gateway.rotate(context, integrationId, 'v2', Buffer.from('replacement'), 'v1');
    keys.delete('key1');
    expect(
      await gateway.useCredential(context, integrationId, (value) =>
        Promise.resolve(value.toString() === 'replacement'),
      ),
    ).toBe(true);
    await expect(gateway.rotate(context, integrationId, 'v3', secret, 'v1')).rejects.toThrow('unavailable');
    const stored = JSON.stringify((await owner.query('select * from connect.credential_envelope')).rows);
    expect(stored).not.toContain(secret.toString());
    expect(stored).not.toContain('replacement');
    expect(stored).not.toContain(Buffer.alloc(32, 2).toString('base64'));
    allowed = false;
    await expect(gateway.useCredential(context, integrationId, () => Promise.resolve(true))).rejects.toThrow(
      'unavailable',
    );
    allowed = true;
  });
  it('TC-SF5-CONNECT-005 validates trusted verification, durable ACK and concurrent delivery dedup after restart', async () => {
    const source = event();
    let verified = true;
    const gateway = createConnectGateway({
      core: core().service,
      keys: { activeVersion: () => 'key', key: () => Buffer.alloc(32, 1) },
      authorize: () => Promise.resolve(true),
      validateCredential: () => Promise.resolve(),
      verify: () =>
        verified
          ? Promise.resolve({ context, repositoryId, event: source })
          : Promise.reject(new Error('signature failed')),
    });
    verified = false;
    await expect(gateway.receive(Buffer.from('payload'), {})).rejects.toThrow('rejected');
    verified = true;
    const receipts = await Promise.all(Array.from({ length: 5 }, () => gateway.receive(Buffer.from('payload'), {})));
    expect(new Set(receipts.map((r) => r.receiptId)).size).toBe(1);
    expect(await core().service.accept(context, repositoryId, source)).toEqual(receipts[0]);
    await expect(core().service.accept(context, repositoryId, { ...source, eventType: 'changed' })).rejects.toThrow(
      'rejected',
    );
    const client = await owner.connect();
    try {
      await client.query('alter table connect.outbox add constraint ck_test_failure check(false) not valid');
      await expect(core().service.accept(context, repositoryId, event('must-rollback'))).rejects.toThrow('unavailable');
    } finally {
      await client.query('alter table connect.outbox drop constraint ck_test_failure');
      client.release();
    }
    expect((await owner.query("select * from connect.inbox where delivery_id='must-rollback'")).rows).toHaveLength(0);
    const outbox = core().outbox(orgId);
    const claimed = await outbox.claim({
      workerId: 'worker',
      limit: 100,
      leaseUntil: new Date(Date.now() + 60000).toISOString(),
    });
    expect(claimed.length).toBeGreaterThan(0);
    const first = claimed[0]!;
    await expect(outbox.ack({ eventId: first.event.eventId, leaseToken: 'wrong' })).rejects.toThrow();
    await outbox.retry({
      eventId: first.event.eventId,
      leaseToken: first.leaseToken,
      retryAt: new Date().toISOString(),
    });
    const retry = await core()
      .outbox(orgId)
      .claim({ workerId: 'restarted', limit: 100, leaseUntil: new Date(Date.now() + 60000).toISOString() });
    expect(retry.some((item) => item.event.eventId === first.event.eventId)).toBe(true);
    await outbox.ack({ eventId: retry[0]!.event.eventId, leaseToken: retry[0]!.leaseToken });
    const expired = claimed[1]!;
    await owner.query("update connect.outbox set lease_until=now()-interval '1 second' where event_id=$1", [
      expired.event.eventId,
    ]);
    await expect(outbox.ack({ eventId: expired.event.eventId, leaseToken: expired.leaseToken })).rejects.toThrow();
    const reclaimed = await core()
      .outbox(orgId)
      .claim({ workerId: 'poll-without-notify', limit: 100, leaseUntil: new Date(Date.now() + 60000).toISOString() });
    expect(reclaimed.some((value) => value.event.eventId === expired.event.eventId)).toBe(true);
  });
});
