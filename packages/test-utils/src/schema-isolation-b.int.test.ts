// TC-PLATFORM-033 — R-platform-010.S2 (plugin "work"): integration tests share one PostgreSQL container, run in
// parallel with schema-isolation-a.int.test.ts, and each plugin's tables stay in its own schema.
import { coreServices, createBackendPlugin } from '@fasrun/backend-plugin-api';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { mockServices } from './mock-services.js';
import { createTestDatabase, type TestDatabase } from './postgres.js';
import { startTestBackend, type TestBackend } from './test-backend.js';

const plugin = createBackendPlugin({
  pluginId: 'work',
  register(env) {
    env.registerInit({
      deps: { database: coreServices.database },
      init: async ({ database }) => {
        const schema = sql.identifier(database.schema);
        await database.db.execute(sql`create schema if not exists ${schema}`);
        await database.db.execute(sql`create table ${schema}.work_item (id text primary key, name text not null)`);
        await database.db.execute(sql`insert into ${schema}.work_item values ('1', 'from work')`);
      },
    });
  },
});

describe('schema isolation for plugin "work" (R-platform-010)', () => {
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

  it('TC-PLATFORM-033 the table exists only in the "work" schema of this test file\'s database', async () => {
    const client = new pg.Client({ connectionString: database?.ownerUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ table_schema: string }>(
        "select table_schema from information_schema.tables where table_name = 'work_item'",
      );
      expect(rows.map((r) => r.table_schema)).toEqual(['work']);
      const other = await client.query("select 1 from information_schema.schemata where schema_name = 'identity'");
      expect(other.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });
});
