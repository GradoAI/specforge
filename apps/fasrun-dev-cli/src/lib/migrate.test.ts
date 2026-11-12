import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationPlugins, runMigrations } from './migrate.js';

describe('migrate required configuration', () => {
  it('TC-PLATFORM-024 rejects missing input without prompting or leaking credentials', async () => {
    await expect(runMigrations('.', undefined)).rejects.toMatchObject({ code: 'FASRUN_USAGE' });
    await expect(runMigrations('.', 'not-a-url')).rejects.toMatchObject({ code: 'FASRUN_CONFIG_INVALID' });
    await expect(runMigrations('.', 'postgres://fasrun_app:secret@127.0.0.1/db')).rejects.toMatchObject({
      code: 'FASRUN_CONFIG_INVALID',
    });
  });
});

it('TC-PLATFORM-024 plugin names keep their directory spelling and use scaffold SQL schema names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fasrun-manifests-'));
  try {
    for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
      const directory = join(root, 'apps', host);
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({ dependencies: { '@fasrun/plugin-work-items-backend': 'workspace:*' } }),
      );
    }
    expect(await migrationPlugins(root)).toEqual([
      {
        schema: 'work_items',
        migrationsDirectory: join(root, 'plugins/work-items/work-items-backend/migrations'),
        baseData: [],
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
