import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../postgres.js';
import { createDbosTestResource, type DbosTestResource } from './dbos-resource.js';

describe('TC-SF5-FIXTURE-001 real DBOS/Postgres resource ownership', () => {
  const resources: DbosTestResource[] = [];
  let sentinel: TestDatabase | undefined;
  afterAll(async () => {
    for (const resource of resources) await resource.dispose();
    await sentinel?.drop();
  });

  it('persists across runtime restart, isolates databases/roles, and cleans up only owned resources', async () => {
    const postgres = inject('fasrunPostgres');
    sentinel = await createTestDatabase(postgres);
    const a = await createDbosTestResource(postgres);
    resources.push(a);
    const b = await createDbosTestResource(postgres);
    resources.push(b);
    expect(a.database.name).not.toBe(b.database.name);
    expect(a.runtimeRole).not.toBe(b.runtimeRole);
    let invocations = 0;
    const workflow = DBOS.registerWorkflow(
      async () => {
        return await DBOS.runStep(() => Promise.resolve(++invocations), { name: 'fixture-step' });
      },
      { name: `fixture_${a.database.name}` },
    );
    await a.start();
    await expect(b.start()).rejects.toThrow('already active');
    expect(await (await DBOS.startWorkflow(workflow, { workflowID: 'fixture-once' })()).getResult()).toBe(1);
    await a.stop();
    await a.start();
    expect(await (await DBOS.startWorkflow(workflow, { workflowID: 'fixture-once' })()).getResult()).toBe(1);
    expect(invocations).toBe(1);

    const app = new pg.Client({ connectionString: a.database.appUrl });
    await app.connect();
    try {
      await expect(app.query('select * from dbos.workflow_status')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
    }
    await a.stop();
    await b.start();
    expect(await (await DBOS.startWorkflow(workflow, { workflowID: 'fixture-once' })()).getResult()).toBe(2);
    await a.dispose();
    await a.dispose();
    expect(DBOS.isInitialized()).toBe(true);
    await expect(a.start()).rejects.toThrow('disposed');
    const admin = new pg.Client({ connectionString: postgres.adminUrl });
    await admin.connect();
    try {
      expect((await admin.query('select 1 from pg_database where datname=$1', [a.database.name])).rowCount).toBe(0);
      expect((await admin.query('select 1 from pg_roles where rolname=$1', [a.runtimeRole])).rowCount).toBe(0);
      expect(
        (
          await admin.query('select 1 from pg_database where datname=any($1)', [
            [postgres.template, sentinel.name, b.database.name],
          ])
        ).rowCount,
      ).toBe(3);
      const role = await admin.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
        'select rolbypassrls, rolsuper from pg_roles where rolname=$1',
        [b.runtimeRole],
      );
      expect(role.rows).toEqual([{ rolbypassrls: false, rolsuper: false }]);
    } finally {
      await admin.end();
    }
  });
});
