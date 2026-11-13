// R-platform-008.S1–S4, D-8: run the shipped CLI against real PostgreSQL roles.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterEach, expect, inject, it } from 'vitest';
import { MIGRATION_LOCK_KEY, type MigrationReport } from '@fasrun/backend-defaults';
import {
  createTestDatabase,
  exampleBaseData,
  EXAMPLE_BASE_DATA_SQL,
  writeMigrationFixture,
  type TestDatabase,
} from '@fasrun/test-utils';

const envelope = (text: string) => JSON.parse(text) as { ok: boolean; result: MigrationReport };

const BIN = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const databases: TestDatabase[] = [];
const directories: string[] = [];
const clients: pg.Client[] = [];
async function fixture() {
  const database = await createTestDatabase(inject('fasrunPostgres'));
  databases.push(database);
  const root = await mkdtemp(join(tmpdir(), 'fasrun-migration-'));
  directories.push(root);
  return { database, root };
}
async function connect(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  clients.push(client);
  return client;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.end()));
  await Promise.all(databases.splice(0).map((database) => database.drop()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
function cli(root: string, databaseUrl: string, json = true) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, 'migrate', '--root', root, ...(json ? ['--json'] : [])], {
      env: { ...process.env, FASRUN_MIGRATE_DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Migration process timed out'));
    }, 45_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

it('TC-PLATFORM-024 real identity migrations run once, grant business tables and protect migration metadata', async () => {
  const { database } = await fixture();
  const first = await cli(ROOT, database.ownerUrl);
  expect(first.code, first.stderr + first.stdout).toBe(0);
  const result = envelope(first.stdout).result;
  expect(result.plugins.map((plugin) => plugin.schema).sort()).toEqual([
    'connect',
    'entry',
    'environment',
    'governance',
    'identity',
    'insight',
    'knowledge',
    'orchestration',
    'spec',
  ]);
  // Independent expectation: Git's tracked SQL files, not the migration discoverer or its journal.
  const prefix = 'plugins/identity/identity-backend/migrations/';
  const expected = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter((file) => !file.includes('/') && file.endsWith('.sql'))
    .sort();
  expect(expected.slice(0, 2)).toEqual(['0000_organization.sql', '0001_organization-comments.sql']);
  expect(result.plugins.find((plugin) => plugin.schema === 'identity')?.migrations).toEqual(expected);
  const owner = await connect(database.ownerUrl);
  const before = await owner.query<{ filename: string }>('select * from identity.schema_migration order by filename');
  expect(before.rows.map((row) => row.filename)).toEqual(expected);
  const catalogSql = `select c.relname, a.attname, a.atttypid, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_value
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'identity' order by c.relname, a.attnum`;
  const catalogBefore = (await owner.query(catalogSql)).rows;
  const structureSql = `select 'constraint' as kind, c.relname as object, x.conname as name, pg_get_constraintdef(x.oid) as definition
    from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='identity'
    union all select 'index', tablename, indexname, indexdef from pg_indexes where schemaname='identity'
    union all select 'policy', tablename, policyname, jsonb_build_array(permissive,roles,cmd,qual,with_check)::text from pg_policies where schemaname='identity'
    union all select 'rls', c.relname, '', jsonb_build_array(c.relrowsecurity,c.relforcerowsecurity)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='identity' and c.relkind='r'
    union all select 'trigger', c.relname, t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='identity' and not t.tgisinternal
    order by kind, object, name`;
  const structureBefore = (await owner.query(structureSql)).rows;
  const second = await cli(ROOT, database.ownerUrl, false);
  expect(second.code).toBe(0);
  expect(second.stdout.trim()).toBe('没有待执行的迁移');
  expect((await owner.query('select * from identity.schema_migration order by filename')).rows).toEqual(before.rows);
  expect((await owner.query(catalogSql)).rows).toEqual(catalogBefore);
  expect((await owner.query(structureSql)).rows).toEqual(structureBefore);
  const app = await connect(database.appUrl);
  expect((await app.query('select * from identity.organization')).rows).toEqual([]);
  for (const table of ['schema_migration', 'base_data_sync']) {
    await expect(app.query(`delete from identity.${table}`)).rejects.toMatchObject({ code: '42501' });
  }
  expect(
    (
      await owner.query<{ allowed: boolean }>(
        "select has_table_privilege('fasrun_app', 'identity.organization', 'insert') as allowed",
      )
    ).rows[0]!.allowed,
  ).toBe(true);
});

it('TC-PLATFORM-025 two CLI processes wait for one advisory lock and apply a migration only once', async () => {
  const { database, root } = await fixture();
  await writeMigrationFixture(root, [
    {
      schema: 'fixture',
      sql: ['create table fixture.once (id int); select pg_sleep(0.2); insert into fixture.once values (1);'],
    },
  ]);
  const owner = await connect(database.ownerUrl);
  await owner.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  const first = cli(root, database.ownerUrl);
  const second = cli(root, database.ownerUrl);
  try {
    let waiting = 0;
    for (let attempt = 0; attempt < 200; attempt++) {
      const locks = await owner.query<{ count: string }>(
        "select count(*) from pg_locks where locktype = 'advisory' and objid = $1 and not granted",
        [MIGRATION_LOCK_KEY],
      );
      waiting = Number(locks.rows[0]?.count);
      if (waiting === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(waiting).toBe(2);
  } finally {
    await owner.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
  const results = await Promise.all([first, second]);
  expect(results.map((result) => result.code)).toEqual([0, 0]);
  expect(results.map((result) => envelope(result.stdout).result.plugins[0]!.migrations.length).sort()).toEqual([0, 1]);
  expect((await owner.query('select * from fixture.once')).rows).toEqual([{ id: 1 }]);
});

it('TC-PLATFORM-026 failure rolls back its transaction, preserves completed plugins and skips later plugins and base data', async () => {
  const { database, root } = await fixture();
  await writeMigrationFixture(root, [
    {
      schema: 'a',
      sql: ['create table a.done (id int primary key, value text);'],
      baseData: [
        {
          key: 'only-after-all',
          version: 1,
          table: 'done',
          keyColumn: 'id',
          rows: [{ id: 1, value: 'base' }],
          customizableColumns: [],
        },
      ],
    },
    { schema: 'b', sql: ['create table b.rolled_back (id int); select * from b.missing;'] },
    { schema: 'c', sql: ['create table c.skipped (id int);'] },
  ]);
  const failed = await cli(root, database.ownerUrl);
  expect(failed.code).toBe(5);
  expect(envelope(failed.stdout).ok).toBe(false);
  expect(failed.stdout).not.toContain(database.ownerUrl);
  const owner = await connect(database.ownerUrl);
  expect(
    (
      await owner.query(
        "select to_regclass('a.done') as a, to_regclass('b.rolled_back') as b, to_regclass('c.skipped') as c",
      )
    ).rows,
  ).toEqual([{ a: 'a.done', b: null, c: null }]);
  expect((await owner.query<{ count: string }>('select count(*) from a.schema_migration')).rows[0]!.count).toBe('1');
  expect((await owner.query<{ count: string }>('select count(*) from b.schema_migration')).rows[0]!.count).toBe('0');
  expect((await owner.query('select * from a.done')).rows).toEqual([]);
  expect((await owner.query('select * from a.base_data_sync')).rows).toEqual([]);
  expect(
    (await owner.query<{ unlocked: boolean }>('select pg_try_advisory_lock($1) as unlocked', [MIGRATION_LOCK_KEY]))
      .rows[0]!.unlocked,
  ).toBe(true);
  await owner.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
});

it('TC-PLATFORM-027 versioned base data preserves custom columns and organization-created rows', async () => {
  const { database, root } = await fixture();
  await writeMigrationFixture(root, [{ schema: 'fixture', sql: [EXAMPLE_BASE_DATA_SQL], baseData: exampleBaseData() }]);
  expect((await cli(root, database.ownerUrl)).code).toBe(0);
  const owner = await connect(database.ownerUrl);
  await owner.query(
    "update fixture.catalog set label = 'My label', is_customized = true where id = 'builtin'; insert into fixture.catalog values ('organization', 'Org', 'Org system', true)",
  );
  const originalSync = (await owner.query('select * from fixture.base_data_sync')).rows;
  expect((await cli(root, database.ownerUrl)).code).toBe(0);
  expect((await owner.query('select * from fixture.base_data_sync')).rows).toEqual(originalSync);
  const file = join(root, 'plugins/fixture/fixture-backend/migrations/base-data.json');
  await writeFile(file, JSON.stringify(exampleBaseData(2)));
  expect((await cli(root, database.ownerUrl)).code).toBe(0);
  expect((await owner.query('select * from fixture.catalog order by id')).rows).toEqual([
    { id: 'builtin', label: 'My label', system_value: 'System v2', is_customized: true },
    { id: 'organization', label: 'Org', system_value: 'Org system', is_customized: true },
    { id: 'untouched', label: 'Default v2', system_value: 'System v2', is_customized: false },
  ]);
  expect((await owner.query<{ version: string }>('select version from fixture.base_data_sync')).rows[0]!.version).toBe(
    '2',
  );
  const invalid = exampleBaseData(3);
  invalid[0]!.rows = [...invalid[0]!.rows, { label: 'missing key' }];
  await writeFile(file, JSON.stringify(invalid));
  expect((await cli(root, database.ownerUrl)).code).toBe(5);
  expect((await owner.query<{ version: string }>('select version from fixture.base_data_sync')).rows[0]!.version).toBe(
    '2',
  );
  expect(
    (await owner.query<{ system_value: string }>("select system_value from fixture.catalog where id = 'builtin'"))
      .rows[0]!.system_value,
  ).toBe('System v2');
  await writeFile(file, JSON.stringify(exampleBaseData(1)));
  expect((await cli(root, database.ownerUrl)).code).toBe(5);
});

it('TC-PLATFORM-024 modified/removed history and unregistered SQL fail closed', async () => {
  const { database, root } = await fixture();
  await writeMigrationFixture(root, [{ schema: 'fixture', sql: ['create table fixture.original (id int);'] }]);
  expect((await cli(root, database.ownerUrl)).code).toBe(0);
  const directory = join(root, 'plugins/fixture/fixture-backend/migrations');
  const migration = join(directory, '0000_fixture.sql');
  const original = await readFile(migration, 'utf8');
  await writeFile(migration, `${original}\n-- changed`);
  expect((await cli(root, database.ownerUrl)).code).toBe(5);
  await writeFile(migration, original);
  await writeFile(join(directory, 'unregistered.sql'), 'select 1;');
  expect((await cli(root, database.ownerUrl)).code).toBe(5);
  await rm(join(directory, 'unregistered.sql'));
  await writeFile(join(directory, 'inserted.sql'), 'select 1;');
  await writeFile(
    join(directory, 'meta/_journal.json'),
    JSON.stringify({
      entries: [
        { idx: 0, tag: 'inserted' },
        { idx: 1, tag: '0000_fixture' },
      ],
    }),
  );
  expect((await cli(root, database.ownerUrl)).code).toBe(5);
  await rm(join(directory, 'inserted.sql'));
  await writeFile(join(directory, 'meta/_journal.json'), JSON.stringify({ entries: [] }));
  await rm(migration);
  expect((await cli(root, database.ownerUrl)).code).toBe(5);
});
