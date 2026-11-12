// SF-1 D-8: one dedicated PostgreSQL session owns the advisory lock for the whole run.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

export interface BaseDataDefinition {
  key: string;
  version: number;
  table: string;
  keyColumn: string;
  rows: readonly Readonly<Record<string, unknown>>[];
  customizableColumns: readonly string[];
}

export interface MigrationPlugin {
  schema: string;
  migrationsDirectory: string;
  baseData?: readonly BaseDataDefinition[];
}

export interface MigrationReport {
  plugins: { schema: string; migrations: string[]; baseData: string[] }[];
}

// Stable across processes/releases; session lock, not a transaction lock.
export const MIGRATION_LOCK_KEY = 1_176_574_286;

function identifier(value: string): string {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error(`Invalid database identifier: ${value}`);
  return `"${value}"`;
}

async function transaction<T>(client: pg.Client, action: () => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    const result = await action();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function journal(directory: string): Promise<{ filename: string; sql: string; hash: string }[]> {
  const files = await readdir(directory);
  if (!files.includes('meta')) {
    if (files.some((file) => file.endsWith('.sql'))) throw new Error(`Missing migration journal: ${directory}`);
    return [];
  }
  const doc = JSON.parse(await readFile(join(directory, 'meta/_journal.json'), 'utf8')) as {
    entries?: { idx: number; tag: string }[];
  };
  if (!Array.isArray(doc.entries)) throw new Error(`Invalid migration journal: ${directory}`);
  if (files.some((file) => file.endsWith('.sql') && !doc.entries!.some((entry) => `${entry.tag}.sql` === file)))
    throw new Error(`Unregistered SQL migration: ${directory}`);
  const seen = new Set<string>();
  return Promise.all(
    doc.entries.map(async (entry, index) => {
      if (entry.idx !== index || !/^[a-zA-Z0-9_-]+$/.test(entry.tag) || seen.has(entry.tag)) {
        throw new Error(`Invalid migration journal entry: ${directory}`);
      }
      seen.add(entry.tag);
      const filename = `${entry.tag}.sql`;
      const sql = await readFile(join(directory, filename), 'utf8');
      return { filename, sql, hash: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

async function syncBaseData(client: pg.Client, schema: string, definition: BaseDataDefinition): Promise<boolean> {
  if (
    typeof definition.key !== 'string' ||
    !definition.key ||
    !Number.isSafeInteger(definition.version) ||
    definition.version < 1
  ) {
    throw new Error('Base data requires a nonempty key and a positive integer version');
  }
  if (!Array.isArray(definition.rows) || !Array.isArray(definition.customizableColumns))
    throw new Error('Invalid base data definition');
  const table = `${schema}.${identifier(definition.table)}`;
  const key = identifier(definition.keyColumn);
  definition.customizableColumns.forEach(identifier);
  if (
    definition.customizableColumns.includes(definition.keyColumn) ||
    definition.customizableColumns.includes('is_customized')
  ) {
    throw new Error('Base data keys and customization markers cannot be customizable columns');
  }
  return transaction(client, async () => {
    const current = await client.query<{ version: string }>(
      `select version from ${schema}.base_data_sync where key = $1`,
      [definition.key],
    );
    if (current.rows[0]?.version === String(definition.version)) return false;
    if (current.rows[0] && Number(current.rows[0].version) > definition.version)
      throw new Error(`Base data version decreased: ${definition.key}`);
    for (const row of definition.rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid base data row');
      const columns = Object.keys(row);
      if (!(definition.keyColumn in row) || columns.length === 0)
        throw new Error(`Missing base data key: ${definition.key}`);
      const updates = columns
        .filter((column) => column !== definition.keyColumn && column !== 'is_customized')
        .map((column) => {
          const quoted = identifier(column);
          return `${quoted} = ${definition.customizableColumns.includes(column) ? `case when target.is_customized = false then excluded.${quoted} else target.${quoted} end` : `excluded.${quoted}`}`;
        });
      await client.query(
        `insert into ${table} as target (${columns.map(identifier).join(', ')}) values (${columns.map((_, index) => `$${index + 1}`).join(', ')}) on conflict (${key}) ${updates.length ? `do update set ${updates.join(', ')}` : 'do nothing'}`,
        columns.map((column) => row[column]),
      );
    }
    await client.query(
      `insert into ${schema}.base_data_sync (key, version) values ($1, $2) on conflict (key) do update set version = excluded.version, synced_at = now()`,
      [definition.key, definition.version],
    );
    return true;
  });
}

/** Plugins are processed in caller-supplied manifest order. Errors leave prior commits intact. */
export async function migrateDatabase(options: {
  connectionString: string;
  plugins: readonly MigrationPlugin[];
  onMigration?: (schema: string, filename: string) => void;
}): Promise<MigrationReport> {
  const schemas = options.plugins.map((plugin) => plugin.schema);
  schemas.forEach(identifier);
  if (new Set(schemas).size !== schemas.length) throw new Error('Duplicate migration plugin schema');
  const client = new pg.Client({ connectionString: options.connectionString });
  let locked = false;
  try {
    await client.connect();
    const role = await client.query<{ name: string; bypass: boolean }>(
      'select current_user as name, rolbypassrls as bypass from pg_roles where rolname = current_user',
    );
    if (role.rows[0]?.name !== 'fasrun_owner' || !role.rows[0].bypass)
      throw new Error('Migrations require fasrun_owner with BYPASSRLS');
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    locked = true;
    const report: MigrationReport = { plugins: [] };
    for (const plugin of options.plugins) {
      const schema = identifier(plugin.schema);
      const migrations = await journal(plugin.migrationsDirectory);
      await transaction(client, async () => {
        await client.query(`create schema if not exists ${schema}`);
        await client.query(`grant usage on schema ${schema} to fasrun_app`);
        await client.query(
          `alter default privileges in schema ${schema} grant select, insert, update, delete on tables to fasrun_app`,
        );
        await client.query(
          `create table if not exists ${schema}.schema_migration (filename text primary key, hash text not null, executed_at timestamptz not null default now())`,
        );
        await client.query(
          `create table if not exists ${schema}.base_data_sync (key text primary key, version bigint not null, synced_at timestamptz not null default now())`,
        );
        await client.query(`revoke all on ${schema}.schema_migration, ${schema}.base_data_sync from fasrun_app`);
      });
      const applied = await client.query<{ filename: string; hash: string }>(
        `select filename, hash from ${schema}.schema_migration`,
      );
      for (const entry of applied.rows) {
        if (migrations.find((migration) => migration.filename === entry.filename)?.hash !== entry.hash) {
          throw new Error(`Applied migration changed or removed: ${plugin.schema}/${entry.filename}`);
        }
      }
      if (
        migrations
          .slice(0, applied.rows.length)
          .some((migration) => !applied.rows.some((entry) => entry.filename === migration.filename))
      ) {
        throw new Error(`Migration history is not a journal prefix: ${plugin.schema}`);
      }
      const result = { schema: plugin.schema, migrations: [] as string[], baseData: [] as string[] };
      report.plugins.push(result);
      for (const migration of migrations) {
        if (applied.rows.some((entry) => entry.filename === migration.filename)) continue;
        await transaction(client, async () => {
          await client.query(migration.sql);
          await client.query(`insert into ${schema}.schema_migration (filename, hash) values ($1, $2)`, [
            migration.filename,
            migration.hash,
          ]);
        });
        result.migrations.push(migration.filename);
        options.onMigration?.(plugin.schema, migration.filename);
      }
      // Also covers tables that predate this runner; future migration tables use the default grants.
      await transaction(client, async () => {
        await client.query(`grant select, insert, update, delete on all tables in schema ${schema} to fasrun_app`);
        await client.query(`revoke all on ${schema}.schema_migration, ${schema}.base_data_sync from fasrun_app`);
      });
    }
    for (const [index, plugin] of options.plugins.entries()) {
      const keys = new Set<string>();
      for (const definition of plugin.baseData ?? []) {
        if (keys.has(definition.key)) throw new Error(`Duplicate base data definition: ${definition.key}`);
        keys.add(definition.key);
        if (await syncBaseData(client, identifier(plugin.schema), definition))
          report.plugins[index]!.baseData.push(definition.key);
      }
    }
    return report;
  } finally {
    try {
      if (locked) await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      await client.end();
    }
  }
}
