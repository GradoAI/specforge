// SF-1 D-15: only the existing organization table is seeded, using the application role and RLS.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterEach, expect, inject, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import { xingheOrganizations } from '@fasrun/test-utils/datasets/xinghe';
import { runMigrations } from './lib/migrate.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BIN = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const databases: TestDatabase[] = [];
const clients: pg.Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.end()));
  await Promise.all(databases.splice(0).map((database) => database.drop()));
});

async function connection(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  clients.push(client);
  return client;
}

function seed(url: string, environment = 'test') {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, 'seed', '--dataset', 'xinghe', '--json'], {
      env: { ...process.env, FASRUN_DATABASE_URL: url, FASRUN_ENVIRONMENT: environment },
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
      reject(new Error('Seed timed out'));
    }, 30_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

it('TC-PLATFORM-034 seed runs as fasrun_app through RLS, repeats unchanged and creates no later business tables', async () => {
  const database = await createTestDatabase(inject('fasrunPostgres'));
  databases.push(database);
  await runMigrations(ROOT, database.ownerUrl);
  const owner = await connection(database.ownerUrl);
  const tables = async () =>
    (
      await owner.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'identity' order by tablename",
      )
    ).rows;
  const beforeTables = await tables();
  const first = await seed(database.appUrl);
  expect(first.code, first.stderr + first.stdout).toBe(0);
  expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, result: { dataset: 'xinghe', organizations: 1 } });
  const before = (await owner.query('select * from identity.organization order by id')).rows;
  expect(before).toHaveLength(1);
  expect(before[0]).toMatchObject({
    id: xingheOrganizations[0]!.id,
    org_id: xingheOrganizations[0]!.id,
    name: '星河科技',
  });
  const second = await seed(database.appUrl);
  expect(second.code, second.stdout).toBe(0);
  expect((await owner.query('select * from identity.organization order by id')).rows).toEqual(before);
  expect(await tables()).toEqual(beforeTables);

  const app = await connection(database.appUrl);
  expect((await app.query('select * from identity.organization')).rows).toEqual([]);
  await app.query('begin');
  await app.query("select set_config('fasrun.org_id', $1, true)", [xingheOrganizations[0]!.id]);
  expect((await app.query('select id from identity.organization')).rows).toEqual([{ id: xingheOrganizations[0]!.id }]);
  await app.query('commit');
  expect((await app.query('select * from identity.organization')).rows).toEqual([]);
  expect((await seed(database.ownerUrl)).code).toBe(3);
});

it('TC-PLATFORM-035 production seed exits before touching an otherwise usable database', async () => {
  const database = await createTestDatabase(inject('fasrunPostgres'));
  databases.push(database);
  await runMigrations(ROOT, database.ownerUrl);
  const result = await seed(database.appUrl, 'production');
  expect(result.code).toBe(3);
  expect(result.stdout).toContain('forbidden in production');
  const owner = await connection(database.ownerUrl);
  expect((await owner.query('select * from identity.organization')).rows).toEqual([]);
});
