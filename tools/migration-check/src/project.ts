import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig, pgSchema } from 'drizzle-orm/pg-core';
import type { TableException } from './conventions.js';
export interface Plugin {
  schema: string;
  files: { path: string; sql: string }[];
  imports: Record<string, unknown>;
  exceptions: Record<string, TableException>;
  tables: { name: string; columns: string[] }[];
}
export async function project(root: string): Promise<Plugin[]> {
  const names = new Set<string>();
  for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
    const manifest = JSON.parse(await readFile(join(root, 'apps', host, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const name of Object.keys(manifest.dependencies))
      if (/^@fasrun\/plugin-[a-z][a-z0-9-]*-backend$/.test(name))
        names.add(name.slice('@fasrun/plugin-'.length, -'-backend'.length));
  }
  const plugins: Plugin[] = [];
  for (const name of [...names].sort()) {
    const schema = name.replaceAll('-', '_');
    const dir = join(root, 'plugins', name, `${name}-backend`, 'migrations');
    const files = await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map(async (f) => ({ path: relative(root, join(dir, f)), sql: await readFile(join(dir, f), 'utf8') })),
    );
    let imports: Record<string, unknown> = { schema: pgSchema(schema) };
    let hasSource = true;
    try {
      await readFile(join(root, 'plugins', name, `${name}-backend/src/infrastructure/schema/index.ts`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      hasSource = false;
    }
    // Deleted source must never be resurrected by a stale generated bundle.
    if (hasSource) {
      try {
        imports = {
          ...imports,
          ...((await import(
            pathToFileURL(join(root, 'tools/migration-check/dist/schemas', name, 'index.mjs')).href
          )) as Record<string, unknown>),
        };
      } catch (error) {
        throw new Error(`Schema bundle missing or invalid: ${name}; run prepare.mjs`, { cause: error });
      }
    }
    const tables = Object.values(imports)
      .filter((v) => is(v, PgTable))
      .map((table) => {
        const config = getTableConfig(table);
        if (config.schema !== schema) throw new Error(`Cross-plugin schema declaration: ${name}`);
        return { name: config.name, columns: config.columns.map((c) => c.name) };
      });
    const exceptions = (imports.tableExceptions ?? {}) as Record<string, TableException>;
    for (const [table, value] of Object.entries(exceptions)) {
      if (
        !tables.some((t) => t.name === table) ||
        Object.entries(value).some(([key, v]) => !['appendOnly', 'platform'].includes(key) || typeof v !== 'boolean')
      )
        throw new Error(`Invalid table exception: ${schema}.${table}`);
    }
    plugins.push({ schema, files, imports, exceptions, tables });
  }
  return plugins;
}
export function source(plugin: Plugin, table: string): string {
  if (['schema_migration', 'base_data_sync'].includes(table)) return 'packages/backend-defaults/src/migrate.ts';
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const create = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:"?${plugin.schema}"?\\.)?"?${escaped}"?\\s*\\(`,
    'i',
  );
  return (
    plugin.files.find((f) => create.test(f.sql))?.path ?? `${plugin.schema}: no creating migration (undeclared table)`
  );
}
