import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';

it('TC-SF5-IDENTITY-004 migration schema can load the published role catalog without a common build', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    files: string[];
    exports: Record<string, unknown>;
  };
  expect(manifest.files).toContain('src/roles.json');
  expect(manifest.exports['./roles.json']).toBe('./src/roles.json');
  const root = await mkdtemp(join(tmpdir(), 'identity-role-catalog-'));
  try {
    const module = join(root, 'node_modules/@fasrun/plugin-identity-common');
    await mkdir(join(module, 'src'), { recursive: true });
    await writeFile(join(module, 'package.json'), JSON.stringify(manifest));
    await copyFile(new URL('./roles.json', import.meta.url), join(module, 'src/roles.json'));
    // Intentionally no dist, TypeScript loader, or any other workspace package in this consumer.
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import roles from '@fasrun/plugin-identity-common/roles.json' with { type: 'json' }; console.log(JSON.stringify(Object.keys(roles)))",
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toEqual([
      'platform_admin',
      'platform_auditor',
      'organization_admin',
      'budget_admin',
      'security_admin',
      'environment_admin',
      'operations',
      'team_lead',
      'member',
      'observer',
      'requirements_reviewer',
      'design_reviewer',
      'merge_approver',
      'machine_owner',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
