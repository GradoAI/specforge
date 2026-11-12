import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, expect, it, inject } from 'vitest';
import { newId, type OperationContext } from '@fasrun/contracts-core';
import { migrateDatabase } from '@fasrun/backend-defaults';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import { createEnvironmentServices } from '../starter/services.js';
import { environmentBaseData } from './base-data.js';
const orgId = newId('org');
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: 'member',
    actorKind: 'member',
    orgId,
    clientId: 'test',
    source: 'internal',
    traceId: 'trace',
  },
  scope: { orgId },
  permission: 'environment.read',
  object: { type: 'template', id: 'default' },
};
let database: TestDatabase, pool: pg.Pool, owner: pg.Pool;
const ended: Promise<void>[] = [];
const poolErrors: string[] = [];
const plugin = {
  schema: 'environment',
  migrationsDirectory: fileURLToPath(new URL('../../migrations/', import.meta.url)),
  baseData: environmentBaseData(orgId, 'member'),
};
beforeAll(async () => {
  database = await createTestDatabase(inject('fasrunPostgres'));
  await migrateDatabase({ connectionString: database.ownerUrl, plugins: [plugin] });
  pool = new pg.Pool({ connectionString: database.appUrl });
  owner = new pg.Pool({ connectionString: database.ownerUrl });
  owner.on('connect', (client) => ended.push(new Promise<void>((resolve) => client.once('end', resolve))));
  owner.on('error', () => poolErrors.push('unexpected pool error'));
  pool.on('connect', (client) => ended.push(new Promise<void>((resolve) => client.once('end', resolve))));
  pool.on('error', () => poolErrors.push('unexpected pool error'));
});
afterAll(async () => {
  await Promise.all([pool?.end(), owner?.end()]);
  await Promise.all(ended);
  await database?.drop();
  expect(poolErrors).toEqual([]);
});
it('TC-SF5-SPEC-008 persists versioned capability snapshots without nodes or execution state', async () => {
  const { service, factory } = createEnvironmentServices({
    pool,
    authorize: () => Promise.resolve(true),
    audit: { audit: (event) => Promise.resolve({ eventId: event.eventId, sequence: 1, hash: 'a'.repeat(64) }) },
  });
  expect(factory.service.scope).toBe('root');
  expect(await service.snapshot(context, { templateId: 'default', templateVersion: '1' })).toEqual({
    version: 1,
    orgId,
    templateId: 'default',
    templateVersion: '1',
    allowedCapabilities: [],
  });
  await expect(
    service.snapshot(
      { ...context, actor: { ...context.actor, orgId: newId('org') }, scope: { orgId: 'mismatch' } },
      { templateId: 'default', templateVersion: '1' },
    ),
  ).rejects.toThrow();
  const other = newId('org');
  await expect(
    service.snapshot(
      { ...context, actor: { ...context.actor, orgId: other }, scope: { orgId: other } },
      { templateId: 'default', templateVersion: '1' },
    ),
  ).rejects.toThrow();
  const client = await pool.connect();
  try {
    for (const sql of [
      "update environment.template_version set snapshot=jsonb_set(snapshot,'{allowedCapabilities}','[\"unauthorized\"]')",
      'delete from environment.template_version',
      'truncate environment.template_version',
    ]) {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [orgId]);
      await expect(client.query(sql)).rejects.toThrow();
      await expect(owner.query(sql)).rejects.toThrow('immutable');
      await client.query('rollback');
    }
  } finally {
    client.release();
  }
  expect(
    (await migrateDatabase({ connectionString: database.ownerUrl, plugins: [plugin] })).plugins[0]!.baseData,
  ).toEqual([]);
});
