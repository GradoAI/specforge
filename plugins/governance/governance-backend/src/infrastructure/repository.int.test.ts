import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createTestPool, disposeTestDatabase } from './test-pool.js';
import { newId, jsonValueSchema } from '@fasrun/contracts-core';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import type { AuditEvent, PolicySnapshot } from '@fasrun/plugin-governance-common';
import { createEventForwarder } from '@fasrun/backend-defaults';
import { beforeAll, afterAll, describe, expect, it, inject } from 'vitest';
import { createGovernanceRepository } from './repository.js';
import { auditHash, GENESIS_HASH } from '../common/audit-hash.js';
import { verifyAuditChain, createGovernanceService } from '../application/governance.js';
const orgA = newId('org'),
  orgB = newId('org');
const actor = (orgId = orgA) => ({
  version: 1 as const,
  actorId: 'member-test',
  actorKind: 'member' as const,
  orgId,
  clientId: 'test',
  source: 'internal' as const,
  traceId: 'trace-test',
});
const event = (orgId = orgA): AuditEvent => ({
  version: 1,
  eventId: newId('evt'),
  actor: actor(orgId),
  action: 'read',
  objectType: 'data',
  objectId: 'test',
  occurredAt: new Date().toISOString(),
  outcome: 'allowed',
  details: { safe: 'redacted' },
});
const policy = (orgId = orgA): PolicySnapshot => ({
  version: 1,
  id: newId('pol'),
  orgId,
  policyVersion: newId('ver'),
  constraints: {
    budgets: [{ scope: 'organization', scopeId: orgId, remaining: 10, hardLimit: 20 }],
    allowedReadScopes: [],
    excludedChannels: [],
  },
});
describe('governance PostgreSQL persistence', () => {
  let database: TestDatabase, owner: pg.Pool, app: pg.Pool, repo: ReturnType<typeof createGovernanceRepository>;
  const pools: ReturnType<typeof createTestPool>[] = [];
  beforeAll(async () => {
    database = await createTestDatabase(inject('fasrunPostgres'));
    const ownerResource = createTestPool('owner', { connectionString: database.ownerUrl });
    const appResource = createTestPool('app', { connectionString: database.appUrl, max: 5 });
    pools.push(ownerResource, appResource);
    owner = ownerResource.pool;
    app = appResource.pool;
    repo = createGovernanceRepository(app);
    const folder = fileURLToPath(new URL('../../migrations/', import.meta.url));
    const journal = JSON.parse(readFileSync(`${folder}meta/_journal.json`, 'utf8')) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) await owner.query(readFileSync(`${folder}${tag}.sql`, 'utf8'));
    await owner.query(
      'grant usage on schema governance to fasrun_app; grant select,insert,update,delete on all tables in schema governance to fasrun_app',
    );
  });
  afterAll(async () => {
    await disposeTestDatabase(pools, async () => {
      await database?.drop();
    });
  });
  it('TC-SF5-GOVERNANCE-002 persists versioned policy/budgets atomically, owner-bound RLS and rollback', async () => {
    const a = policy(),
      b = policy(orgB);
    await repo.transaction(orgA, 'test', (tx) => tx.publishPolicy(a));
    await repo.transaction(orgB, 'test', (tx) => tx.publishPolicy(b));
    const context = {
      actor: actor(),
      permission: 'policy.read',
      scope: { orgId: orgA },
      object: { type: 'policy', id: 'current' },
    };
    // The repository only uses the authenticated actor tenant; the application validates the complete operation DTO.
    expect(await repo.transaction(orgA, 'test', (tx) => tx.policy(context))).toEqual(a);
    expect((await app.query('select * from governance.policy_version')).rows).toEqual([]);
    await expect(repo.transaction(orgA, 'test', (tx) => tx.publishPolicy(policy(orgB)))).rejects.toThrow(
      'Organization mismatch',
    );
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [orgA]);
      expect((await client.query('select org_id from governance.policy_version')).rows).toEqual([{ org_id: orgA }]);
      await expect(
        client.query(
          'insert into governance.policy_version(id,org_id,created_by,policy_version,snapshot) values($1,$2,$3,$4,$5)',
          [newId('pol'), orgB, 'test', 'cross-org', b],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('rollback');
      client.release();
    }
    expect((await app.query('select * from governance.policy_version')).rows).toEqual([]);
    const rolled = policy();
    await expect(
      repo.transaction(orgA, 'test', async (tx) => {
        await tx.publishPolicy(rolled);
        throw new Error('fault');
      }),
    ).rejects.toThrow('fault');
    expect((await owner.query('select * from governance.policy_version where id=$1', [rolled.id])).rowCount).toBe(0);
    expect(
      (await owner.query('select * from governance.budget_constraint where policy_id=$1', [rolled.id])).rowCount,
    ).toBe(0);
    const tables = await owner.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      comment: string;
    }>(
      "select relname,relrowsecurity,relforcerowsecurity,obj_description(c.oid) comment from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and relkind='r'",
    );
    expect(tables.rows).toHaveLength(6);
    for (const t of tables.rows) {
      expect(t).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
      expect(t.comment).toBeTruthy();
    }
    const undocumented = await owner.query(
      "select attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relkind='r' and a.attnum>0 and not a.attisdropped and col_description(c.oid,a.attnum) is null",
    );
    expect(undocumented.rows).toEqual([]);
    const role = await app.query('select rolsuper,rolbypassrls from pg_roles where rolname=current_user');
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
  it('TC-SF5-IDENTITY-012 serializes concurrent audit append, idempotency, immutable rows and independent head evidence', async () => {
    const org = newId('org');
    const inputs = Array.from({ length: 6 }, () => event(org));
    await Promise.all(inputs.map((input) => repo.transaction(org, 'test', (tx) => tx.appendAudit(input))));
    const records = await repo.transaction(org, 'test', (tx) => tx.auditRecords());
    expect(records.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    let previousHash = GENESIS_HASH;
    for (const record of records) {
      expect(record.previousHash).toBe(previousHash);
      expect(record.hash).toBe(auditHash(previousHash, record.event));
      previousHash = record.hash;
    }
    const original = records[0]!;
    expect(await repo.transaction(org, 'test', (tx) => tx.appendAudit(original.event))).toEqual(original);
    await expect(
      repo.transaction(org, 'test', (tx) => tx.appendAudit({ ...original.event, action: 'changed' })),
    ).rejects.toThrow('identity conflict');
    for (const sql of [
      'update governance.audit_event set hash=hash',
      'delete from governance.audit_event',
      'truncate governance.audit_event',
      'update governance.chain_checkpoint set hash=hash',
      'delete from governance.policy_version',
    ])
      await expect(owner.query(sql)).rejects.toMatchObject({ code: '55000' });
    for (const statement of ['update governance.audit_event set hash=hash', 'delete from governance.audit_event']) {
      const connection = await app.connect();
      try {
        await connection.query('begin');
        await connection.query("select set_config('fasrun.org_id',$1,true)", [org]);
        await expect(connection.query(statement)).rejects.toMatchObject({ code: '55000' });
      } finally {
        await connection.query('rollback');
        connection.release();
      }
    }
    await expect(app.query('truncate governance.audit_event')).rejects.toMatchObject({ code: '42501' });
    const independentHead = structuredClone(records.at(-1)!);
    const verify = (copy: typeof records) =>
      verifyAuditChain(copy, { orgId: org, sequence: independentHead.sequence, hash: independentHead.hash });
    expect(verify(records)).toBe(true);
    const modified = structuredClone(records);
    modified[0]!.event.action = 'tampered';
    expect(verify(modified)).toBe(false);
    expect(verify(records.slice(1))).toBe(false);
    expect(verify(records.slice(0, -1))).toBe(false);
  });
  it('TC-SF5-IDENTITY-013 real audit transaction failure prevents sensitive data reads', async () => {
    const org = newId('org'),
      snapshot = policy(org);
    snapshot.constraints = { budgets: [], allowedReadScopes: [{ orgId: org }], excludedChannels: [] };
    await repo.transaction(org, 'test', (tx) => tx.publishPolicy(snapshot));
    let reads = 0;
    const service = createGovernanceService({
      repository: repo,
      authorize: () => Promise.resolve(true),
      authorizeAudit: () => Promise.resolve(true),
      checkpoints: { load: () => Promise.resolve(undefined), publish: async () => {} },
      clock: () => new Date().toISOString(),
      eventId: () => newId('evt'),
      redact: (value) => value,
    });
    const input = {
      context: {
        actor: actor(org),
        permission: 'data.read',
        scope: { orgId: org },
        object: { type: 'data', id: 'sensitive' },
      },
      facts: {},
      estimatedUnitCost: 1,
      retryLimit: 0,
      references: [],
      channel: 'model',
    };
    await owner.query(
      "create function governance.test_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'audit disk unavailable'; end $$; create trigger test_audit_failure before insert on governance.audit_event for each row execute function governance.test_audit_failure()",
    );
    try {
      await expect(
        service.sensitiveRead(input, () => {
          reads++;
          return Promise.resolve('secret');
        }),
      ).rejects.toThrow();
      expect(reads).toBe(0);
    } finally {
      await owner.query(
        'drop trigger test_audit_failure on governance.audit_event; drop function governance.test_audit_failure()',
      );
    }
    expect(
      await service.sensitiveRead(input, () => {
        reads++;
        return Promise.resolve('secret');
      }),
    ).toBe('secret');
    expect(reads).toBe(1);
  });
  it('TC-SF5-GOVERNANCE-002 atomic consumer receipts rollback and duplicate delivery do not repeat business writes', async () => {
    const org = newId('org'),
      input = event(org),
      id = newId('evt');
    await expect(
      repo.transaction(org, 'test', (tx) =>
        tx.consume(id, async () => {
          await tx.appendAudit(input);
          throw new Error('crash');
        }),
      ),
    ).rejects.toThrow('crash');
    expect(await repo.transaction(org, 'test', (tx) => tx.auditRecords())).toEqual([]);
    const rolledEvent = {
      version: 1 as const,
      eventId: newId('evt'),
      orgId: org,
      topic: 'governance.test.created',
      payload: null,
      occurredAt: new Date().toISOString(),
    };
    await expect(
      repo.transaction(org, 'test', async (tx) => {
        await tx.enqueue(rolledEvent);
        await tx.appendAudit(input);
        throw new Error('rollback both');
      }),
    ).rejects.toThrow('rollback both');
    expect(
      (await owner.query('select id from governance.outbox where event_id=$1', [rolledEvent.eventId])).rows,
    ).toEqual([]);
    expect(await repo.transaction(org, 'test', (tx) => tx.auditRecords())).toEqual([]);
    const results = await Promise.all(
      [1, 2].map(() =>
        repo.transaction(org, 'test', (tx) =>
          tx.consume(id, async () => {
            await tx.appendAudit(input);
          }),
        ),
      ),
    );
    expect(results.sort()).toEqual([false, true]);
    expect(await repo.transaction(org, 'test', (tx) => tx.auditRecords())).toHaveLength(1);
  });
  it('TC-SF5-GOVERNANCE-002 unique indexes enforce policy versions, chain sequences and ON CONFLICT inference', async () => {
    const org = newId('org'),
      snapshot = policy(org),
      audit = event(org);
    await repo.transaction(org, 'test', async (tx) => {
      await tx.publishPolicy(snapshot);
      await tx.appendAudit(audit);
    });
    await expect(
      repo.transaction(org, 'test', (tx) => tx.publishPolicy({ ...snapshot, id: newId('pol') })),
    ).rejects.toMatchObject({ code: '23505', constraint: 'ix_policy_version_org_version' });
    await expect(
      owner.query(
        'insert into governance.audit_event(id,org_id,created_by,event_id,sequence,previous_hash,hash,event) select $1,org_id,created_by,$2,sequence,previous_hash,hash,event from governance.audit_event where org_id=$3',
        [newId('aud'), newId('evt'), org],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'ix_audit_event_org_sequence' });
    await expect(
      owner.query(
        'insert into governance.chain_checkpoint(id,org_id,created_by,sequence,hash) select $1,org_id,created_by,sequence,hash from governance.chain_checkpoint where org_id=$2',
        [newId('chk'), org],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'ix_chain_checkpoint_org_sequence' });
    const output = {
      version: 1 as const,
      eventId: newId('evt'),
      orgId: org,
      topic: 'governance.test.created',
      payload: null,
      occurredAt: new Date().toISOString(),
    };
    await repo.transaction(org, 'test', async (tx) => {
      await tx.enqueue(output);
      await tx.enqueue(output);
    });
    expect((await owner.query('select id from governance.outbox where event_id=$1', [output.eventId])).rowCount).toBe(
      1,
    );
    await expect(
      repo.transaction(org, 'test', (tx) => tx.enqueue({ ...output, payload: 'different' })),
    ).rejects.toThrow('identity conflict');
  });
  it('TC-SF5-IDENTITY-012 audit consumer retries checkpoint publication after atomic receipt commit', async () => {
    const org = newId('org'),
      audit = event(org);
    let unavailable = true,
      head: { orgId: string; sequence: number; hash: string } | undefined;
    const service = createGovernanceService({
      repository: repo,
      authorize: () => Promise.resolve(true),
      authorizeAudit: () => Promise.resolve(true),
      checkpoints: {
        load: () => Promise.resolve(head),
        publish(checkpoint) {
          if (unavailable) return Promise.reject(new Error('checkpoint disk unavailable'));
          head = checkpoint;
          return Promise.resolve();
        },
      },
      clock: () => new Date().toISOString(),
      eventId: () => newId('evt'),
      redact: (value) => value,
    });
    const envelope = {
      version: 1 as const,
      eventId: audit.eventId,
      orgId: org,
      topic: 'governance.audit.requested',
      payload: jsonValueSchema.parse(audit),
      occurredAt: audit.occurredAt,
    };
    await expect(service.consumeAudit(envelope)).rejects.toThrow();
    expect((await owner.query('select id from governance.consumer_receipt where org_id=$1', [org])).rowCount).toBe(1);
    expect(await repo.transaction(org, 'test', (tx) => tx.auditRecords())).toHaveLength(1);
    unavailable = false;
    await service.consumeAudit(envelope);
    await service.consumeAudit(envelope);
    expect(head?.sequence).toBe(1);
    expect(await repo.transaction(org, 'test', (tx) => tx.auditRecords())).toHaveLength(1);
  });
  it('TC-SF5-GOVERNANCE-002 SKIP LOCKED claims, lease expiry, retry timing and polling without NOTIFY', async () => {
    const org = newId('org'),
      port = repo.outbox(org);
    const events = Array.from({ length: 4 }, () => ({
      version: 1 as const,
      eventId: newId('evt'),
      orgId: org,
      topic: 'governance.test.created',
      payload: { safe: true },
      occurredAt: new Date().toISOString(),
    }));
    await repo.transaction(org, 'test', async (tx) => {
      for (const item of events) await tx.enqueue(item);
    });
    const locked = await owner.connect();
    try {
      await locked.query('begin');
      await locked.query('select id from governance.outbox where event_id=$1 for update', [events[0]!.eventId]);
      const available = await port.claim({
        workerId: 'skip-locked',
        limit: 4,
        leaseUntil: new Date(Date.now() + 60000).toISOString(),
      });
      expect(available).toHaveLength(3);
      expect(available.some((item) => item.event.eventId === events[0]!.eventId)).toBe(false);
      for (const item of available)
        await port.retry({
          eventId: item.event.eventId,
          leaseToken: item.leaseToken,
          retryAt: new Date(0).toISOString(),
        });
    } finally {
      await locked.query('rollback');
      locked.release();
    }
    const claims = await Promise.all(
      ['one', 'two'].map((workerId) =>
        port.claim({ workerId, limit: 2, leaseUntil: new Date(Date.now() + 60000).toISOString() }),
      ),
    );
    expect(new Set(claims.flat().map((c) => c.event.eventId)).size).toBe(4);
    const stale = claims[0]![0]!;
    await owner.query(
      "update governance.outbox set lease_until=clock_timestamp()-interval '1 second' where event_id=$1",
      [stale.event.eventId],
    );
    const reclaimed = (
      await port.claim({ workerId: 'three', limit: 1, leaseUntil: new Date(Date.now() + 60000).toISOString() })
    )[0]!;
    expect(reclaimed.event.eventId).toBe(stale.event.eventId);
    expect(reclaimed.leaseToken).not.toBe(stale.leaseToken);
    await expect(port.ack({ eventId: stale.event.eventId, leaseToken: stale.leaseToken })).rejects.toThrow(
      'lease lost',
    );
    await port.retry({
      eventId: reclaimed.event.eventId,
      leaseToken: reclaimed.leaseToken,
      retryAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(
      await port.claim({ workerId: 'four', limit: 4, leaseUntil: new Date(Date.now() + 60000).toISOString() }),
    ).toEqual([]);
    await owner.query("update governance.outbox set lease_until=null,retry_at=clock_timestamp()-interval '1 second'");
    const received: string[] = [];
    const forwarder = createEventForwarder({ workerId: 'poll-test', onError: () => {} });
    forwarder.register(port);
    forwarder.registerConsumer({
      id: 'governance-test',
      topic: 'governance.test.created',
      async consume(item) {
        await repo.transaction(org, 'test', (tx) =>
          tx.consume(item.eventId, () => {
            received.push(item.eventId);
            return Promise.resolve();
          }),
        );
      },
    });
    await forwarder.pollOnce();
    await forwarder.pollOnce();
    expect(new Set(received).size).toBe(4);
    expect(
      (
        await owner.query<{ n: number }>(
          "select count(*)::int n from governance.outbox where org_id=$1 and state='delivered'",
          [org],
        )
      ).rows[0]?.n,
    ).toBe(4);
  });
});
