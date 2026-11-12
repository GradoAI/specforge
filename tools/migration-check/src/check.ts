import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import pg from 'pg';
import { catalog } from './catalog.js';
import { checkConventions } from './conventions.js';
import { checkInternal, INTERNAL_TABLES } from './internal.js';
import { project, source, type Plugin } from './project.js';
const exec = promisify(execFile);
export function safeDetail(detail: string): string {
  return detail.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]');
}
export function parseDiff(json: string, schemas: string[]): Record<string, string[]> {
  const diff = JSON.parse(json) as Record<string, string[]>;
  if (
    !diff ||
    typeof diff !== 'object' ||
    Array.isArray(diff) ||
    Object.keys(diff).length !== schemas.length ||
    schemas.some((schema) => !Array.isArray(diff[schema]) || diff[schema].some((sql) => typeof sql !== 'string'))
  )
    throw new Error('Incomplete or malformed Drizzle diff');
  return diff;
}
export interface Diagnostic {
  phase: 'squawk' | 'migration' | 'drizzle' | 'conventions';
  file: string;
  table: string;
  rule: string;
  detail: string;
}
export async function lintSql(root: string, files: string[]): Promise<Diagnostic[]> {
  if (!files.length) return [];
  try {
    await exec(
      resolve(root, 'tools/migration-check/runtime/node_modules/.bin/squawk'),
      ['--config', resolve(root, '.squawk.toml'), '--assume-in-transaction', '--reporter', 'gcc', ...files],
      { cwd: root },
    );
    return [];
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return [
      {
        phase: 'squawk',
        file: files.join(', '),
        table: 'SQL',
        rule: 'squawk',
        detail: [e.stdout, e.stderr, e.message].filter(Boolean).join('\n'),
      },
    ];
  }
}
export async function checkDatabase(root: string, url: string, plugins?: Plugin[]): Promise<Diagnostic[]> {
  const definitions = plugins ?? (await project(root));
  const diagnostics: Diagnostic[] = [];
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('begin read only');
    const tables = await catalog(
      client,
      definitions.map((p) => p.schema),
    );
    for (const issue of checkInternal(
      tables,
      definitions.map((p) => p.schema),
    ))
      diagnostics.push({ phase: 'conventions', file: 'packages/backend-defaults/src/migrate.ts', ...issue });
    for (const table of tables) {
      if ((INTERNAL_TABLES as readonly string[]).includes(table.name)) continue;
      const plugin = definitions.find((p) => p.schema === table.schema)!;
      const file = source(plugin, table.name);
      if (!plugin.tables.some((t) => t.name === table.name))
        diagnostics.push({
          phase: 'drizzle',
          file,
          table: `${table.schema}.${table.name}`,
          rule: 'undeclared-table',
          detail: 'Actual table has no business Drizzle definition',
        });
      for (const issue of checkConventions(table, plugin.exceptions[table.name]))
        diagnostics.push({ phase: 'conventions', file, ...issue });
    }
  } catch (error) {
    diagnostics.push({
      phase: 'conventions',
      file: 'tools/migration-check',
      table: 'database',
      rule: 'catalog-failed',
      detail: safeDetail(error instanceof Error ? error.message : 'catalog failed'),
    });
  } finally {
    await client.end();
  }
  try {
    const { stdout } = await exec(process.execPath, [resolve(root, 'tools/migration-check/dist/diff-worker.mjs')], {
      cwd: root,
      env: { ...process.env, FASRUN_CHECK_DATABASE_URL: url },
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const line = stdout.split('\n').find((l) => l.startsWith('FASRUN_DIFF='));
    if (!line) throw new Error('Drizzle did not return a complete diff');
    const diff = parseDiff(
      line.slice('FASRUN_DIFF='.length),
      definitions.map((p) => p.schema),
    );
    for (const plugin of definitions)
      for (const sql of diff[plugin.schema]!) {
        const table = /"[^"]+"\."([^"]+)"/.exec(sql)?.[1] ?? plugin.tables[0]?.name ?? plugin.schema;
        diagnostics.push({
          phase: 'drizzle',
          file: source(plugin, table),
          table: `${plugin.schema}.${table}`,
          rule: 'schema-drift',
          detail: sql,
        });
      }
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    diagnostics.push({
      phase: 'drizzle',
      file: 'tools/migration-check',
      table: 'database',
      rule: 'diff-failed',
      detail: safeDetail(e.stderr || e.message || 'diff failed'),
    });
  }
  return diagnostics;
}
export async function migrate(root: string, url: string): Promise<void> {
  await exec(process.execPath, [resolve(root, 'apps/fasrun-dev-cli/bin/run.js'), 'migrate', '--json'], {
    cwd: root,
    env: { ...process.env, FASRUN_MIGRATE_DATABASE_URL: url },
    timeout: 60000,
  });
}
