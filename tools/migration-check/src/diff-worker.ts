// Separate process gives noninteractive CI a bounded deadline even if upstream asks about a rename.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import pg from 'pg';
import { project } from './project.js';
interface Kit {
  pushSchema(
    imports: Record<string, unknown>,
    db: { $client: pg.Client },
    schemas: string[],
    tables: string[],
  ): Promise<{ statementsToExecute: string[] }>;
}
const root = process.cwd();
const require = createRequire(import.meta.url);
const kit = require(resolve(root, 'tools/migration-check/runtime/node_modules/drizzle-kit/fasrun-api.cjs')) as Kit;
const client = new pg.Client({ connectionString: process.env.FASRUN_CHECK_DATABASE_URL });
try {
  await client.connect();
  await client.query('begin read only');
  const plugins = await project(root);
  const result: Record<string, string[]> = {};
  for (const plugin of plugins) {
    const diff = await kit.pushSchema(
      plugin.imports,
      { $client: client },
      [plugin.schema],
      ['!schema_migration', '!base_data_sync'],
    );
    // Kit represents a named single-column PK differently when introspecting PostgreSQL.
    // Remove only an exact drop/recreate pair proven identical to the actual catalog key.
    const keys = await client.query<{
      table: string;
      name: string;
      columns: string[];
      deferrable: boolean;
      deferred: boolean;
    }>(
      `select t.relname as table,c.conname as name,c.condeferrable as deferrable,c.condeferred as deferred,array_agg(a.attname::text order by k.ord) as columns from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace cross join lateral unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=t.oid and a.attnum=k.num where c.contype='p' and n.nspname=$1 group by t.relname,c.conname,c.condeferrable,c.condeferred`,
      [plugin.schema],
    );
    const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
    const statements = diff.statementsToExecute.slice();
    for (const key of keys.rows) {
      if (key.columns.length !== 1 || key.deferrable || key.deferred) continue;
      const prefix = `ALTER TABLE ${quote(plugin.schema)}.${quote(key.table)}`;
      const drop = `${prefix} DROP CONSTRAINT ${quote(key.name)}`;
      const add = `${prefix} ADD CONSTRAINT ${quote(key.name)} PRIMARY KEY(${key.columns.map(quote).join(',')});`;
      const a = statements.indexOf(drop),
        b = statements.indexOf(add);
      if (a >= 0 && b >= 0) {
        statements.splice(Math.max(a, b), 1);
        statements.splice(Math.min(a, b), 1);
      }
    }
    result[plugin.schema] = statements;
  }
  console.log(`FASRUN_DIFF=${JSON.stringify(result)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Drizzle diff failed');
  process.exitCode = 1;
} finally {
  await client.end();
}
