import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { checkDatabase, safeDetail, lintSql, migrate, type Diagnostic } from './check.js';
import { project } from './project.js';
const root = process.cwd();
const diagnostics: Diagnostic[] = [];
let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
try {
  const plugins = await project(root);
  diagnostics.push(
    ...(await lintSql(
      root,
      plugins.flatMap((p) => p.files.map((f) => f.path)),
    )),
  );
  container = await new PostgreSqlContainer('postgres:18-alpine').withDatabase('fasrun_check').start();
  const admin = new pg.Client({ connectionString: container.getConnectionUri() });
  const password = randomBytes(24).toString('hex');
  await admin.connect();
  try {
    await admin.query(`create role fasrun_owner login bypassrls password '${password}'`);
    await admin.query('create role fasrun_app nologin nobypassrls');
    await admin.query('alter database fasrun_check owner to fasrun_owner');
  } finally {
    await admin.end();
  }
  const url = new URL(container.getConnectionUri());
  url.username = 'fasrun_owner';
  url.password = password;
  try {
    await migrate(root, url.toString());
  } catch {
    diagnostics.push({
      phase: 'migration',
      file: plugins.flatMap((p) => p.files.map((f) => f.path)).join(', '),
      table: 'database',
      rule: 'migration-failed',
      detail: 'fasrun migrate failed on the empty database; inspect listed migration journals',
    });
  }
  // All independent stages run; catalog/diff may still diagnose a partial failed migration.
  diagnostics.push(...(await checkDatabase(root, url.toString(), plugins)));
} catch (error) {
  diagnostics.push({
    phase: 'migration',
    file: 'tools/migration-check',
    table: 'database',
    rule: 'check-error',
    detail: safeDetail(error instanceof Error ? error.message : 'check failed'),
  });
} finally {
  await container?.stop();
}
for (const issue of diagnostics)
  console.error(`[${issue.phase}/${issue.rule}] ${issue.file} :: ${issue.table}: ${issue.detail}`);
if (diagnostics.length) process.exitCode = 1;
else console.log('migration-check: squawk, Drizzle diff, business conventions and executor tables passed');
