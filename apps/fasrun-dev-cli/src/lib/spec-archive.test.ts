import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { runSpecArchive } from './spec-archive.js';

vi.mock('node:fs/promises', async (importOriginal) => ({ ...(await importOriginal<typeof fs>()) }));
vi.setConfig({ testTimeout: 30_000 });
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
const entry = (n: number, title: string) =>
  `### Requirement: R-demo-00${n} ${title}\nDescription\n#### Scenario: R-demo-00${n}.S1 Works\n- GIVEN input\n- WHEN applied\n- THEN done\n`;
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'fasrun-archive-'));
  dirs.push(root);
  const files: Record<string, string> = {
    'specs/demo/spec.md': `# Demo\n## Requirements\n${entry(1, 'Old')}${entry(2, 'Removed')}${entry(3, 'Old')}`,
    'changes/demo/specs/demo/spec.md': `## ADDED Requirements\n${entry(4, 'Added')}\n## MODIFIED Requirements\n${entry(1, 'Modified')}\n## REMOVED Requirements\n### Requirement: R-demo-002 Removed\n原因：old\n迁移：none\n## RENAMED Requirements\n- FROM: R-demo-003 Old\n- TO: R-demo-003 New\n`,
    'changes/demo/notes.txt': 'Retain non-Markdown artifacts\n',
  };
  for (const [file, text] of Object.entries(files)) {
    await fs.mkdir(dirname(join(root, file)), { recursive: true });
    await fs.writeFile(join(root, file), text);
  }
  return { root, files };
}
async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(path: string) {
    for (const item of await fs.readdir(join(root, path), { withFileTypes: true })) {
      const file = path ? `${path}/${item.name}` : item.name;
      if (item.isDirectory()) {
        result[`${file}/`] = '';
        await walk(file);
      } else result[file] = await fs.readFile(join(root, file), 'utf8');
    }
  }
  await walk('');
  return result;
}
const bin = fileURLToPath(new URL('../../bin/run.js', import.meta.url));
function cli(args: string[]) {
  return spawnSync(process.execPath, [bin, ...args, '--json'], { encoding: 'utf8', timeout: 20_000 });
}

it('TC-SPEC-013 actual CLI archives all operations, preserves artifacts, then validates', async () => {
  const { root } = await fixture();
  const result = cli(['spec', 'archive', join(root, 'changes/demo'), '--date', '2026-11-12']);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, result: { updated: ['specs/demo/spec.md'] } });
  const tree = await snapshot(root);
  const current = tree['specs/demo/spec.md']!;
  expect(current).toContain('R-demo-001 Modified');
  expect(current).not.toContain('R-demo-002');
  expect(current).toContain('R-demo-003 New');
  expect(current).toContain('R-demo-003.S1 Works');
  expect(current).toContain('R-demo-004 Added');
  expect(tree['changes/archive/2026-11-12-demo/notes.txt']).toContain('Retain');
  expect(tree['changes/demo/']).toBeUndefined();
  expect(cli(['spec', 'validate', root]).status).toBe(0);
});
it('TC-SPEC-013 defaults to the UTC date', async () => {
  const { root } = await fixture();
  const dates = [new Date().toISOString().slice(0, 10)];
  const result = await runSpecArchive(join(root, 'changes/demo'));
  dates.push(new Date().toISOString().slice(0, 10));
  expect(dates.some((date) => result.archived.endsWith(`${date}-demo`))).toBe(true);
});
it('TC-SPEC-014 actual CLI rejects conflicts, invalid dates and invalid source without any filesystem changes', async () => {
  const { root } = await fixture();
  await fs.writeFile(join(root, 'changes/demo/specs/demo/spec.md'), `## ADDED Requirements\n${entry(1, 'Duplicate')}`);
  const before = await snapshot(root);
  for (const args of [
    ['spec', 'archive', join(root, 'changes/demo')],
    ['spec', 'archive', join(root, 'changes/demo'), '--date', '2026-02-30'],
    ['spec', 'archive', join(root, 'changes/archive')],
  ]) {
    const result = cli(args);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: 'FASRUN_CHECK_FAILED' } });
    expect(await snapshot(root)).toEqual(before);
  }
});
it('TC-SPEC-014 refuses unsupported current sections without losing auxiliary content', async () => {
  const { root } = await fixture();
  await fs.appendFile(join(root, 'specs/demo/spec.md'), '\n## Notes\nImportant auxiliary content.\n');
  const before = await snapshot(root);
  const result = cli(['spec', 'archive', join(root, 'changes/demo')]);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('Unsupported current spec heading');
  expect(await snapshot(root)).toEqual(before);
});
it('TC-SPEC-014 rejects an existing empty archive target and symlinked inputs', async () => {
  const { root } = await fixture();
  await fs.mkdir(join(root, 'changes/archive/2026-11-12-demo'), { recursive: true });
  const before = await snapshot(root);
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Archive exists');
  expect(await snapshot(root)).toEqual(before);
  await fs.symlink(join(root, 'specs/demo/spec.md'), join(root, 'link.md'));
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Symlink');
  expect(await fs.readlink(join(root, 'link.md'))).toBe(join(root, 'specs/demo/spec.md'));
});
it.each([1, 2, 3, 4, 5])('TC-SPEC-014 rolls back an injected rename failure at step %i', async (step) => {
  const { root } = await fixture();
  await fs.mkdir(join(root, 'specs/other'));
  await fs.mkdir(join(root, 'changes/demo/specs/other'));
  await fs.writeFile(join(root, 'specs/other/spec.md'), '# Other\n## Requirements\n');
  await fs.writeFile(
    join(root, 'changes/demo/specs/other/spec.md'),
    `## ADDED Requirements\n${entry(5, 'Second file')}`,
  );
  const before = await snapshot(root);
  const original = fs.rename;
  let count = 0;
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (++count === step) throw new Error('Injected rename failure');
    return original(from, to);
  });
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Injected');
  expect(await snapshot(root)).toEqual(before);
});
it('TC-SPEC-014 temporary write failure leaves the source tree intact', async () => {
  const { root } = await fixture();
  const before = await snapshot(root);
  vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Injected write failure'));
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Injected');
  expect(await snapshot(root)).toEqual(before);
});
