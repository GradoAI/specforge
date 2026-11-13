import { readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { newId } from '@fasrun/contracts-core';
import { createDataService } from './service.js';
import { dataFixture } from './test-fixture.js';
describe('TC-CF-014 immutable references and owner storage', () => {
  const { fixture: f, request } = dataFixture();
  it('stores canonical bytes before an immutable index and distinguishes labels', async () => {
    const a = request(),
      first = await f.service!.register(f.context, a);
    const second = await f.service!.register(f.context, {
      ...a,
      labels: { ...a.labels, source: { kind: 'external', id: 'other' } },
    });
    expect(first.versionHash).not.toBe(second.versionHash);
    expect((await f.service!.read({ context: f.context, ref: first })).value).toEqual(a.value);
    expect(await f.service!.register(f.context, a)).toEqual(first);
    const rows = await f.owner!.query<{ content_hash: string }>(
      'select object, content_hash from orchestration.data_object',
    );
    expect(rows.rowCount).toBe(2);
    expect((await readdir(f.root)).filter((name) => !name.startsWith('.'))).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(f.root, rows.rows[0]!.content_hash), 'utf8'))).toEqual(a.value);
    for (const sql of [
      'update orchestration.data_object set version=2',
      'delete from orchestration.data_object',
      'truncate orchestration.data_object',
    ])
      await expect(f.owner!.query(sql)).rejects.toMatchObject({ code: '55000' });
    expect((await f.owner!.query('select * from orchestration.data_object')).rowCount).toBe(2);
  });
  it('rechecks current authorization, label metadata and tenant; audit failure never returns content', async () => {
    const ref = await f.service!.register(f.context, request());
    f.revoked = true;
    await expect(f.service!.read({ context: f.context, ref })).rejects.toThrow('denied');
    f.revoked = false;
    await expect(
      f.service!.read({ context: f.context, ref: { ...ref, labels: { ...ref.labels, classification: 'public' } } }),
    ).rejects.toThrow('denied');
    const orgId = newId('org');
    await expect(
      f.service!.read({ context: { ...f.context, actor: { ...f.context.actor, orgId }, scope: { orgId } }, ref }),
    ).rejects.toThrow('denied');
    const actor = { ...f.context.actor };
    delete actor.authorizationId;
    await expect(
      f.service!.read({ context: { ...f.context, actor: { ...actor, actorKind: 'agent' } }, ref }),
    ).rejects.toThrow('denied');
    f.auditFails = true;
    await expect(f.service!.read({ context: f.context, ref })).rejects.toThrow('Data operation denied or unavailable');
    f.auditFails = false;
    f.policyAllowed = false;
    await expect(f.service!.read({ context: f.context, ref })).rejects.toThrow('denied');
    f.policyAllowed = true;
    expect(f.audits.some((audit) => audit.outcome === 'denied')).toBe(true);
    expect(JSON.stringify(f.audits)).not.toContain('same content');
    const client = await f.pool!.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [orgId]);
      expect((await client.query('select * from orchestration.data_object')).rowCount).toBe(0);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
  it('never reports success for missing content or failed index/audit transaction; preserves orphan for retention', async () => {
    const ref = await f.service!.register(f.context, request({ value: 'missing-file' }));
    const record = await f.deps!.repository.find(f.context.actor.orgId, f.context.actor.actorId, ref.id);
    await unlink(path.join(f.root, record!.contentHash));
    await expect(f.service!.read({ context: f.context, ref })).rejects.toThrow('denied');
    const before = (await f.owner!.query<{ count: string }>('select count(*) as count from orchestration.data_object'))
      .rows[0]!.count;
    await f.owner!.query(
      "create function orchestration.reject_test_audit() returns trigger language plpgsql as $$ begin raise exception 'fault'; end $$; create trigger reject_test_audit before insert on orchestration.outbox for each row execute function orchestration.reject_test_audit()",
    );
    try {
      await expect(f.service!.register(f.context, request({ value: 'orphan' }))).rejects.toThrow('denied');
    } finally {
      await f.owner!.query(
        'drop trigger reject_test_audit on orchestration.outbox; drop function orchestration.reject_test_audit()',
      );
    }
    expect(
      (await f.owner!.query<{ count: string }>('select count(*) as count from orchestration.data_object')).rows[0]!
        .count,
    ).toBe(before);
    const failStorage = createDataService({
      ...f.deps!,
      storage: { put: () => Promise.reject(new Error('disk-full')), get: () => Promise.resolve(undefined) },
    });
    await expect(failStorage.register(f.context, request())).rejects.toThrow('denied');
    const absentStorage = createDataService({
      ...f.deps!,
      storage: { put: () => Promise.resolve(), get: () => Promise.resolve(undefined) },
    });
    await expect(absentStorage.register(f.context, request())).rejects.toThrow('denied');
  });
  it('delivers mutation audit outbox with bounded tenant leases and rejects stale acknowledgments', async () => {
    const ref = await f.service!.register(f.context, request({ value: 'audit-event' }));
    const port = f.deps!.repository.outbox(f.context.actor.orgId),
      other = f.deps!.repository.outbox(newId('org'));
    expect(
      await other.claim({ workerId: 'worker', limit: 10, leaseUntil: new Date(Date.now() + 60000).toISOString() }),
    ).toEqual([]);
    await expect(port.claim({ workerId: '', limit: 0, leaseUntil: 'bad' })).rejects.toThrow();
    const claimed = await port.claim({
      workerId: 'worker',
      limit: 100,
      leaseUntil: new Date(Date.now() + 60000).toISOString(),
    });
    expect(claimed.some((item) => JSON.stringify(item.event).includes(ref.id))).toBe(true);
    const item = claimed[0]!;
    await expect(port.ack({ eventId: item.event.eventId, leaseToken: 'stale' })).rejects.toThrow();
    await port.retry({ eventId: item.event.eventId, leaseToken: item.leaseToken, retryAt: new Date(0).toISOString() });
    const retry = (
      await port.claim({ workerId: 'worker', limit: 100, leaseUntil: new Date(Date.now() + 60000).toISOString() })
    )[0]!;
    await port.ack({ eventId: retry.event.eventId, leaseToken: retry.leaseToken });
  });
  it('routes only explicitly registered owner parsers and verifies their metadata/content before returning', async () => {
    const data = request(),
      local = await f.service!.register(f.context, data);
    const ref = { ...local, ownerPlugin: 'spec', id: local.id.replace('ref://orchestration/', 'ref://spec/') };
    await expect(f.service!.read({ context: f.context, ref })).rejects.toThrow('denied');
    let reads = 0;
    const resolver = {
      ownerPlugin: 'spec',
      resolve: () => {
        reads++;
        return Promise.resolve({ ref, value: data.value });
      },
    };
    expect(() => createDataService({ ...f.deps!, resolvers: [resolver, resolver] })).toThrow('Duplicate');
    expect(() => createDataService({ ...f.deps!, resolvers: [{ ...resolver, ownerPlugin: 'orchestration' }] })).toThrow(
      'Duplicate',
    );
    const service = createDataService({ ...f.deps!, resolvers: [resolver] });
    expect(await service.read({ context: f.context, ref })).toEqual({ ref, value: data.value });
    f.auditFails = true;
    await expect(service.read({ context: f.context, ref })).rejects.toThrow('denied');
    f.auditFails = false;
    expect(reads).toBe(1);
    for (const result of [
      { ref: local, value: data.value },
      { ref, value: 'corrupt body' },
    ]) {
      const invalid = createDataService({
        ...f.deps!,
        resolvers: [{ ownerPlugin: 'spec', resolve: () => Promise.resolve(result) }],
      });
      await expect(invalid.read({ context: f.context, ref })).rejects.toThrow('denied');
    }
  });
  it('rejects widening, invalid object identity, cross-organization inserts, and damaged stored bytes', async () => {
    const data = request(),
      ref = await f.service!.register(f.context, data);
    await expect(f.service!.register(f.context, { ...data, objectId: '../unsafe' })).rejects.toThrow('denied');
    await expect(f.service!.register(f.context, { ...data, category: '../unsafe' })).rejects.toThrow('denied');
    await expect(
      f.service!.register({ ...f.context, scope: { ...f.context.scope, projectId: 'limited' } }, data),
    ).rejects.toThrow('denied');
    const corrupt = createDataService({
      ...f.deps!,
      storage: { ...f.deps!.storage, get: () => Promise.resolve(new Uint8Array([0])) },
    });
    await expect(corrupt.read({ context: f.context, ref })).rejects.toThrow('denied');
    const client = await f.pool!.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [newId('org')]);
      await expect(
        client.query(
          `insert into orchestration.data_object(id,org_id,created_by,object_id,category,version_hash,content_hash,byte_length,object)
        values($1,$2,$3,$4,'document',$5,$5,1,'{}')`,
          [newId('dat'), f.context.actor.orgId, f.context.actor.actorId, newId('obj'), 'a'.repeat(64)],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
