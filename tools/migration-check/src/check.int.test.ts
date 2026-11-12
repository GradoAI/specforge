import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createTestDatabase, type TestPostgres, type TestDatabase } from '@fasrun/test-utils';
import pg from 'pg';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { project } from './project.js';
import { catalog } from './catalog.js';
import { checkInternal } from './internal.js';
import { checkDatabase, lintSql, migrate } from './check.js';
declare module 'vitest' {
  interface ProvidedContext {
    fasrunPostgres: TestPostgres;
  }
}
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
let database: TestDatabase;
let owner: pg.Client;
let admin: pg.Client;
beforeAll(async () => {
  const postgres = inject('fasrunPostgres');
  database = await createTestDatabase(postgres);
  await migrate(root, database.ownerUrl);
  owner = new pg.Client({ connectionString: database.ownerUrl });
  await owner.connect();
  const url = new URL(postgres.adminUrl);
  url.pathname = `/${database.name}`;
  admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
});
afterAll(async () => {
  await owner?.end();
  await admin?.end();
  await database?.drop();
});
it('TC-PLATFORM-031 accepts all actual migrations, Drizzle definitions and 18 internal tables', async () => {
  expect(
    await lintSql(
      root,
      (await project(root)).flatMap((p) => p.files.map((f) => f.path)),
    ),
  ).toEqual([]);
  expect(await checkDatabase(root, database.ownerUrl)).toEqual([]);
});
it('TC-PLATFORM-028 rejects a nonconcurrent index on an existing table with filename and rule', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'fasrun-squawk-'));
  const file = resolve(dir, 'unsafe-index.sql');
  try {
    await writeFile(file, 'CREATE INDEX ix_unsafe ON identity.organization (name);\n');
    const issues = await lintSql(root, [file]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.file).toBe(file);
    expect(issues[0]!.detail).toContain('require-concurrent-index-creation');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('TC-PLATFORM-030 detects a missing declared column and never applies Drizzle suggestions', async () => {
  await owner.query('alter table identity.organization drop column deactivated_at');
  try {
    const issues = await checkDatabase(root, database.ownerUrl);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'drizzle',
          table: 'identity.organization',
          rule: 'schema-drift',
          detail: expect.stringContaining('deactivated_at') as unknown,
        }),
      ]),
    );
    const columns = await owner.query(
      "select 1 from information_schema.columns where table_schema='identity' and table_name='organization' and column_name='deactivated_at'",
    );
    expect(columns.rows).toHaveLength(0);
  } finally {
    await owner.query(
      "alter table identity.organization add column deactivated_at timestamptz; comment on column identity.organization.deactivated_at is 'Deactivation timestamp'",
    );
  }
});
it('TC-PLATFORM-029 reports multiple real catalog convention failures with migration/table context', async () => {
  await owner.query('create table identity.bad_table (id varchar(100))');
  try {
    const issues = await checkDatabase(root, database.ownerUrl);
    const bad = issues.filter((x) => x.table === 'identity.bad_table');
    expect(bad.map((x) => x.rule)).toEqual(
      expect.arrayContaining(['text-type', 'standard-column', 'table-comment', 'row-security', 'undeclared-table']),
    );
    expect(bad.every((x) => x.file.includes('no creating migration'))).toBe(true);
  } finally {
    await owner.query('drop table identity.bad_table');
  }
});
it('TC-PLATFORM-068 checks actual privileges (PUBLIC, inherited, column, MAINTAIN), strict domains, keys and owner', async () => {
  const inspect = async () => checkInternal(await catalog(admin, ['identity']), ['identity']);
  for (const grant of [
    'grant select on identity.schema_migration to public',
    'grant maintain on identity.schema_migration to fasrun_app',
    'grant select (filename) on identity.schema_migration to fasrun_app',
  ]) {
    await admin.query('begin');
    try {
      await admin.query(grant);
      expect(await inspect()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'identity.schema_migration', rule: 'internal-app-privileges' }),
        ]),
      );
    } finally {
      await admin.query('rollback');
    }
  }
  await admin.query('begin');
  try {
    await admin.query(
      'create role executor_reader; grant executor_reader to fasrun_app; grant select on identity.base_data_sync to executor_reader',
    );
    expect(await inspect()).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'internal-app-privileges' })]),
    );
  } finally {
    await admin.query('rollback');
  }
  const mutations: [string, string][] = [
    ['drop table identity.schema_migration', 'internal-missing'],
    ['alter table identity.base_data_sync add column extra text', 'internal-fields'],
    [
      'create domain identity.fake_text as text; alter table identity.schema_migration alter column hash type identity.fake_text',
      'internal-column',
    ],
    ['alter table identity.base_data_sync alter column version type integer', 'internal-column'],
    ['alter table identity.schema_migration alter column hash drop not null', 'internal-column'],
    ['alter table identity.base_data_sync drop constraint base_data_sync_pkey', 'internal-primary-key'],
    ['alter table identity.schema_migration owner to current_user', 'internal-owner'],
  ];
  for (const [sql, rule] of mutations) {
    await admin.query('begin');
    try {
      await admin.query(sql);
      expect(
        (await inspect()).map((x) => x.rule),
        sql,
      ).toContain(rule);
    } finally {
      await admin.query('rollback');
    }
  }
});
it('TC-PLATFORM-068 never exempts another table sharing the executor prefix', async () => {
  await owner.query('create table identity.schema_migration_backup (filename text)');
  try {
    const issues = await checkDatabase(root, database.ownerUrl);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'identity.schema_migration_backup', rule: 'undeclared-table' }),
        expect.objectContaining({ table: 'identity.schema_migration_backup', rule: 'standard-column' }),
      ]),
    );
  } finally {
    await owner.query('drop table identity.schema_migration_backup');
  }
});
it('TC-PLATFORM-030 retains actual named primary key drift', async () => {
  await owner.query('alter table identity.organization rename constraint pk_organization to pk_changed');
  try {
    const issues = await checkDatabase(root, database.ownerUrl);
    expect(issues.some((x) => x.phase === 'drizzle' && x.detail.includes('pk_changed'))).toBe(true);
  } finally {
    await owner.query('alter table identity.organization rename constraint pk_changed to pk_organization');
  }
});
it('TC-PLATFORM-030 detects same-name primary key column drift', async () => {
  await owner.query(
    'alter table identity.organization drop constraint pk_organization; alter table identity.organization add constraint pk_organization primary key(slug)',
  );
  try {
    const issues = await checkDatabase(root, database.ownerUrl);
    expect(issues.some((x) => x.phase === 'drizzle' && x.detail.includes('PRIMARY KEY("id")'))).toBe(true);
  } finally {
    await owner.query(
      'alter table identity.organization drop constraint pk_organization; alter table identity.organization add constraint pk_organization primary key(id)',
    );
  }
});
it('TC-PLATFORM-068 Drizzle includes undeclared composite-key tables rather than broad filtering', async () => {
  await owner.query('create table identity.base_data_sync_backup (a text,b text,primary key(a,b))');
  try {
    const issues = await checkDatabase(root, database.ownerUrl);
    expect(
      issues
        .filter((x) => x.phase === 'drizzle' && x.rule === 'schema-drift')
        .some((x) => x.detail.includes('DROP TABLE "identity"."base_data_sync_backup"')),
    ).toBe(true);
    expect(issues.some((x) => x.rule === 'diff-failed')).toBe(false);
  } finally {
    await owner.query('drop table identity.base_data_sync_backup');
  }
});
it('TC-PLATFORM-030 does not normalize away deferrable primary key semantics', async () => {
  await owner.query(
    'alter table identity.organization drop constraint pk_organization; alter table identity.organization add constraint pk_organization primary key(id) deferrable initially deferred',
  );
  try {
    const issues = await checkDatabase(root, database.ownerUrl);
    expect(issues.some((x) => x.phase === 'drizzle' && x.detail.includes('pk_organization'))).toBe(true);
  } finally {
    await owner.query(
      'alter table identity.organization drop constraint pk_organization; alter table identity.organization add constraint pk_organization primary key(id)',
    );
  }
});
