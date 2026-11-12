import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  migrateDatabase,
  type BaseDataDefinition,
  type MigrationPlugin,
  type MigrationReport,
} from '@fasrun/backend-defaults';
import { CliError, CliErrorCodes } from '../errors.js';

/** Read host manifests as data, without loading plugins or starting their services. */
export async function migrationPlugins(root: string): Promise<MigrationPlugin[]> {
  const names = new Set<string>();
  for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
    const manifest = JSON.parse(await readFile(join(root, 'apps', host, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (/^@fasrun\/plugin-[a-z][a-z0-9-]*-backend$/.test(name)) names.add(name);
    }
  }
  return Promise.all(
    [...names].sort().map(async (name) => {
      const plugin = name.slice('@fasrun/plugin-'.length, -'-backend'.length);
      const schema = plugin.replaceAll('-', '_');
      const migrationsDirectory = join(root, 'plugins', plugin, `${plugin}-backend`, 'migrations');
      let baseData: BaseDataDefinition[] = [];
      try {
        baseData = JSON.parse(
          await readFile(join(migrationsDirectory, 'base-data.json'), 'utf8'),
        ) as BaseDataDefinition[];
        if (!Array.isArray(baseData)) throw new Error('Base data definitions must be an array');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      return { schema, migrationsDirectory, baseData };
    }),
  );
}

export async function runMigrations(root: string, connectionString: string | undefined): Promise<MigrationReport> {
  if (!connectionString) throw new CliError(CliErrorCodes.USAGE, 'Missing required FASRUN_MIGRATE_DATABASE_URL');
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, 'FASRUN_MIGRATE_DATABASE_URL must be a PostgreSQL URL');
  }
  if (decodeURIComponent(url.username) !== 'fasrun_owner')
    throw new CliError(CliErrorCodes.CONFIG_INVALID, 'FASRUN_MIGRATE_DATABASE_URL must use fasrun_owner');
  try {
    return await migrateDatabase({ connectionString, plugins: await migrationPlugins(root) });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code ?? '')) {
      throw new CliError(CliErrorCodes.UNREACHABLE, 'Cannot connect to the migration database');
    }
    if (['28P01', '28000'].includes(code ?? ''))
      throw new CliError(CliErrorCodes.CONFIG_INVALID, 'Migration database authentication failed');
    // Never include database URLs or arbitrary SQL contents in the command's output.
    throw new CliError(
      CliErrorCodes.INTERNAL,
      'Migration failed; completed migrations remain applied. Check the plugin journal and database configuration.',
    );
  }
}
