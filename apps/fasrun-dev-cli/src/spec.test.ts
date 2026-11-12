// SF-1 T014: actual CLI processes, isolated fixtures, exact exit and JSON envelope contracts.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });
const bin = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures = fileURLToPath(new URL('../../../plugins/spec/spec-common/test/fixtures/', import.meta.url));
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'fasrun-spec-'));
  dirs.push(dir);
  return dir;
}
function cli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', input: '', timeout: 20_000 });
}
function write(root: string, file: string, text: string) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
function tree(files: Record<string, string>) {
  const dir = temp();
  write(dir, 'fasrun/config.yaml', 'allowedPaths:\n  - apps/\n');
  for (const [file, text] of Object.entries(files)) write(dir, `fasrun/${file}`, text);
  return dir;
}

describe('spec validate and check (D-10, D-11)', () => {
  it('TC-SPEC-001 the complete repository validates and checks through the public bin', () => {
    for (const args of [
      ['spec', 'validate', 'fasrun/', '--json'],
      ['check', '--json'],
    ]) {
      const result = cli(root, args);
      expect(result.stderr).toBe('');
      expect(result.status, result.stdout).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
    }
  });
  it('TC-SPEC-002 CLI errors include category, full path and line with exit 1', () => {
    const fixture = JSON.parse(readFileSync(join(fixtures, 'spec-id-format.json'), 'utf8')) as {
      files: Record<string, string>;
    };
    const dir = tree(fixture.files);
    const result = cli(dir, ['spec', 'validate']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `SPEC_ID_FORMAT ${resolve(realpathSync(dir), 'fasrun/changes/demo/specs/demo/spec.md')}:3`,
    );
    expect(result.stdout).toBe('');
    const json = cli(dir, ['spec', 'validate', '--json']);
    expect(json.status).toBe(1);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: false,
      command: 'spec:validate',
      error: { code: 'FASRUN_CHECK_FAILED', message: expect.stringContaining('SPEC_ID_FORMAT') as string },
    });
  });
  it('TC-PLATFORM-061 check runs spec validation before config schemas', () => {
    const dir = temp();
    expect(cli(dir, ['init']).status).toBe(0);
    const passed = cli(dir, ['check', '--json']);
    expect(passed.status, passed.stderr).toBe(0);
    expect(JSON.parse(passed.stdout)).toMatchObject({
      result: { checks: ['spec validate', 'Fasfile', 'fasrun.yaml'] },
    });
    write(dir, 'Fasfile', 'version: 2\n');
    const rejected = cli(dir, ['check', '--json']);
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout)).toMatchObject({
      error: { code: 'FASRUN_CHECK_FAILED', message: 'Fasfile: version must be 1, got 2' },
    });
    write(
      dir,
      'fasrun/changes/demo/specs/demo/spec.md',
      '## ADDED Requirements\n### Requirement: R-demo-001 Missing scenario\nDescription\n',
    );
    const ordered = cli(dir, ['check', '--json']);
    expect(ordered.status).toBe(1);
    expect((JSON.parse(ordered.stdout) as { error: { message: string } }).error.message).toContain('SPEC_NO_SCENARIO');
    expect((JSON.parse(ordered.stdout) as { error: { message: string } }).error.message).not.toContain(
      'version must be 1',
    );
  });
  it('TC-PLATFORM-061 check rejects unknown config keys, invalid YAML and missing files', () => {
    const dir = temp();
    expect(cli(dir, ['init']).status).toBe(0);
    for (const value of ['version: 1\nunknown: true\n', 'version: [\n', '- sequence\n']) {
      write(dir, 'Fasfile', value);
      const result = cli(dir, ['check', '--json']);
      expect(result.status).toBe(1);
      expect((JSON.parse(result.stdout) as { error: { message: string } }).error.message).toContain('Fasfile:');
    }
    write(dir, 'Fasfile', 'version: 1\n');
    write(dir, 'fasrun.yaml', 'version: 1\nspec_root: fasrun/\nunknown: true\n');
    expect(cli(dir, ['check']).status).toBe(1);
    rmSync(join(dir, 'fasrun.yaml'));
    expect(cli(dir, ['check']).status).toBe(3);
  });
  it('TC-SPEC-001/011 explicit root, missing root and invalid or missing allow-list are handled', () => {
    const valid = JSON.parse(readFileSync(join(fixtures, 'valid.json'), 'utf8')) as Record<string, string>;
    const dir = tree(valid);
    expect(cli(dir, ['spec', 'validate', join(dir, 'fasrun')]).status).toBe(0);
    expect(cli(dir, ['spec', 'validate', 'missing']).status).toBe(3);
    for (const value of ['allowedPaths: [\n', 'allowedPaths: all\n', 'allowedPaths: [1]\n']) {
      write(dir, 'fasrun/config.yaml', value);
      expect(cli(dir, ['spec', 'validate']).status).toBe(3);
    }
    rmSync(join(dir, 'fasrun/config.yaml'));
    expect(cli(dir, ['spec', 'validate']).status).toBe(3);
  });
});
