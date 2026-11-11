// TC-PLATFORM-033 — R-platform-010.S2 (plugin "identity"): integration tests share one PostgreSQL container, run in
// parallel with schema-isolation-b.int.test.ts, and each plugin's tables stay in its own schema.
import { coreServices, createBackendPlugin } from '@fasrun/backend-plugin-api';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { mockServices } from './mock-services.js';
import { createTestDatabase, type TestDatabase } from './postgres.js';
import { startTestBackend, type TestBackend } from './test-backend.js';

const plugin = createBackendPlugin({
  pluginId: 'identity',
  register(env) {
    env.registerInit({
      deps: { database: coreServices.database },
      init: async ({ database }) => {
        const schema = sql.identifier(database.schema);
        await database.db.execute(sql`create schema if not exists ${schema}`);
        await database.db.execute(sql`create table ${schema}.organization (id text primary key, name text not null)`);
        await database.db.execute(sql`insert into ${schema}.organization values ('1', 'from identity')`);
      },
    });
  },
});

describe('schema isolation for plugin "identity" (R-platform-010)', () => {
  let database: TestDatabase | undefined;
  let backend: TestBackend | undefined;
  beforeAll(async () => {
    database = await createTestDatabase(inject('fasrunPostgres'));
    backend = await startTestBackend({ features: [plugin], services: [mockServices.database(database.ownerUrl)] });
  });
  afterAll(async () => {
    await backend?.stop();
    await database?.drop();
  });

  it('TC-PLATFORM-033 the table exists only in the "identity" schema of this test file\'s database', async () => {
    const client = new pg.Client({ connectionString: database?.ownerUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ table_schema: string }>(
        "select table_schema from information_schema.tables where table_name = 'organization'",
      );
      expect(rows.map((r) => r.table_schema)).toEqual(['identity']);
      const other = await client.query("select 1 from information_schema.schemata where schema_name = 'work'");
      expect(other.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('creates the login roles of SF-1 D-7 with the right row-level-security bypass', async () => {
    const client = new pg.Client({ connectionString: inject('fasrunPostgres').adminUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ rolname: string; rolbypassrls: boolean; rolcanlogin: boolean }>(
        "select rolname, rolbypassrls, rolcanlogin from pg_roles where rolname in ('fasrun_owner', 'fasrun_app') order by rolname",
      );
      expect(rows).toEqual([
        { rolname: 'fasrun_app', rolbypassrls: false, rolcanlogin: true },
        { rolname: 'fasrun_owner', rolbypassrls: true, rolcanlogin: true },
      ]);
      const app = new pg.Client({ connectionString: database?.appUrl });
      await app.connect();
      await app.end();
    } finally {
      await client.end();
    }
  });
});
