import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { project } from './project.js';
it('TC-PLATFORM-030 never loads a stale schema bundle after its source was removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fasrun-check-project-'));
  try {
    for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
      await mkdir(join(root, 'apps', host), { recursive: true });
      await writeFile(
        join(root, 'apps', host, 'package.json'),
        JSON.stringify({ dependencies: { '@fasrun/plugin-demo-backend': 'workspace:*' } }),
      );
    }
    await mkdir(join(root, 'plugins/demo/demo-backend/migrations'), { recursive: true });
    await mkdir(join(root, 'tools/migration-check/dist/schemas/demo'), { recursive: true });
    await writeFile(
      join(root, 'tools/migration-check/dist/schemas/demo/index.mjs'),
      "throw new Error('stale bundle imported');",
    );
    expect((await project(root))[0]!.tables).toEqual([]);
    await mkdir(join(root, 'plugins/demo/demo-backend/src/infrastructure/schema'), { recursive: true });
    await writeFile(join(root, 'plugins/demo/demo-backend/src/infrastructure/schema/index.ts'), 'export {};');
    await expect(project(root)).rejects.toThrow('Schema bundle missing or invalid');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
