import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { newId, type OperationContext } from '@fasrun/contracts-core';
import { migrateDatabase } from '@fasrun/backend-defaults';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import { createProjectRepository } from '../infrastructure/repository.js';
import { knowledgeBaseData } from '../infrastructure/base-data.js';
import { createProjectContextService } from './project-context.js';
const org = newId('org'),
  other = newId('org');
function context(orgId = org): OperationContext {
  return {
    actor: {
      version: 1,
      actorId: 'member',
      actorKind: 'member',
      orgId,
      clientId: 'test',
      source: 'internal',
      traceId: 'trace',
    },
    scope: { orgId, projectId: 'project' },
    object: { type: 'repository', id: 'repo' },
    permission: 'knowledge.read',
  };
}
describe('TC-SF5-SPEC-008 PostgreSQL project captures', () => {
  let database: TestDatabase, owner: pg.Pool, app: pg.Pool;
  const ended: Promise<void>[] = [];
  const poolErrors: string[] = [];
  const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
  const request = { repositoryId: 'repo', baseCommit: 'a'.repeat(40) };
  const plugin = () => ({
    schema: 'knowledge',
    migrationsDirectory,
    baseData: [...knowledgeBaseData(org, 'member'), ...knowledgeBaseData(other, 'member')],
  });
  beforeAll(async () => {
    database = await createTestDatabase(inject('fasrunPostgres'));
    await migrateDatabase({ connectionString: database.ownerUrl, plugins: [plugin()] });
    owner = new pg.Pool({ connectionString: database.ownerUrl });
    app = new pg.Pool({ connectionString: database.appUrl });
    for (const pool of [owner, app]) {
      pool.on('connect', (client) => ended.push(new Promise<void>((resolve) => client.once('end', resolve))));
      pool.on('error', () => poolErrors.push('unexpected pool error'));
    }
  });
  afterAll(async () => {
    await Promise.all([app?.end(), owner?.end()]);
    await Promise.all(ended);
    await database?.drop();
    expect(poolErrors).toEqual([]);
  });
  function service() {
    return createProjectContextService({
      repository: createProjectRepository(app),
      audit: { audit: (event) => Promise.resolve({ eventId: event.eventId, sequence: 1, hash: 'a'.repeat(64) }) },
      authorize: () => Promise.resolve(true),
      members: {
        resolveMembers: (_context, ids) => Promise.resolve(ids.map((id) => ({ id, orgId: org, active: true }))),
      },
      environment: {
        snapshot: (ctx, selection) =>
          Promise.resolve({ version: 1, orgId: ctx.actor.orgId, ...selection, allowedCapabilities: ['test'] }),
      },
      files: {
        read: (_context, input) =>
          Promise.resolve({
            ...input,
            projectId: 'project',
            fasrunYaml: 'version: 1\nspec_root: fasrun/\nspec_template: default@1\n',
          }),
      },
    });
  }
  it('captures A once under concurrency, preserves it after restart and isolates a new B and another tenant', async () => {
    const api = service();
    const captured = await Promise.all(Array.from({ length: 5 }, () => api.loadProjectContext(context(), request)));
    expect(captured.every((value) => value.configRef.id === captured[0]!.configRef.id)).toBe(true);
    expect(
      (
        await owner.query<{ count: number }>(
          'select count(*)::int as count from knowledge.project_config_cache where org_id=$1',
          [org],
        )
      ).rows[0]!.count,
    ).toBe(1);
    await owner.query(
      "insert into knowledge.organization_rule(id,org_id,created_by,definition_key,definition_version,snapshot,is_customized) select $1,org_id,created_by,definition_key,'2',jsonb_set(snapshot,'{definitionVersion}','\"2\"'),true from knowledge.organization_rule where org_id=$2",
      [newId('orl'), org],
    );
    expect((await service().readProject(context(), { ...request, pin: captured[0]! })).context).toEqual(captured[0]);
    expect((await api.loadProjectContext(context(), request)).policyVersion).toBe('default@2');
    await expect(
      api.readProject(context(), { ...request, pin: { ...captured[0]!, policyVersion: 'missing@1' } }),
    ).rejects.toThrow('unavailable');
    expect((await api.loadProjectContext(context(), { ...request, baseCommit: 'b'.repeat(40) })).policyVersion).toBe(
      'default@2',
    );
    expect((await api.loadProjectContext(context(other), request)).orgId).toBe(other);
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [org]);
      expect((await client.query('select distinct org_id from knowledge.project_config_cache')).rows).toEqual([
        { org_id: org },
      ]);
      await client.query('rollback');
      for (const sql of [
        'update knowledge.project_config_cache set snapshot=snapshot',
        'delete from knowledge.project_config_cache',
        'truncate knowledge.project_config_cache',
      ]) {
        await expect(client.query(sql)).rejects.toThrow();
      }
      await expect(client.query('select * from environment.template_version')).rejects.toThrow();
    } finally {
      client.release();
    }
  });
  it('base data repeats unchanged, retains organization customizations and catalogs include only M1 entities', async () => {
    expect(
      (await migrateDatabase({ connectionString: database.ownerUrl, plugins: [plugin()] })).plugins[0]!.baseData,
    ).toEqual([]);
    const current = await createProjectRepository(app).catalog(context(), 'default@1');
    expect(current.organizationRule.definitionVersion).toBe('2');
    expect(current.workflows.map((workflow) => workflow.classification).sort()).toEqual([
      'feature',
      'small_defect',
      'standard_defect',
    ]);
    expect(current.workflows.find((workflow) => workflow.classification === 'small_defect')?.layers).toEqual([
      'requirements',
    ]);
    await expect(createProjectRepository(app).catalog(context(), 'missing@1')).rejects.toThrow();
    await expect(createProjectRepository(app).catalog(context(), 'default')).rejects.toThrow('explicit');
    await expect(createProjectRepository(app).cached(context('bad-org'), 'repo', request.baseCommit)).rejects.toThrow(
      'Invalid organization',
    );
    for (const table of ['organization_rule', 'spec_template', 'workflow_definition']) {
      await expect(
        owner.query(
          `update knowledge.${table} set snapshot=jsonb_set(snapshot,'{definitionVersion}','"999"') where org_id=$1`,
          [org],
        ),
      ).rejects.toThrow('immutable');
      await expect(owner.query(`delete from knowledge.${table} where org_id=$1`, [org])).rejects.toThrow('immutable');
      await expect(owner.query(`truncate knowledge.${table}`)).rejects.toThrow('immutable');
    }
    await owner.query(
      "insert into knowledge.spec_template(id,org_id,created_by,definition_key,definition_version,snapshot,is_customized) select $1,org_id,created_by,'corrupt','1',snapshot,true from knowledge.spec_template where org_id=$2",
      [newId('spt'), org],
    );
    await expect(createProjectRepository(app).catalog(context(), 'corrupt@1')).rejects.toThrow('identity mismatch');
    const tables = await owner.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname='knowledge' order by tablename",
    );
    expect(tables.rows.map((row) => row.tablename)).toEqual([
      'base_data_sync',
      'organization_rule',
      'project_config_cache',
      'schema_migration',
      'spec_template',
      'workflow_definition',
    ]);
  });
});
