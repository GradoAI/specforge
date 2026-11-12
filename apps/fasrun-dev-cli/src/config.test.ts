import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { fasfileSchema, validateRepoConfig } from '@fasrun/plugin-spec-common';
import { parse, stringify } from 'yaml';
const directories: string[] = [];
const bin = new URL('../bin/run.js', import.meta.url).pathname;
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
it('TC-SF5-PLATFORM-001 init, contract and CLI JSON share declaration validation and field locations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fasrun-config-'));
  directories.push(directory);
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, [bin, ...args, '--json'], { cwd: directory, encoding: 'utf8' });
  expect(cli('init').status).toBe(0);
  for (const kind of ['fasrun.yaml', 'Fasfile'] as const)
    expect(validateRepoConfig(kind, readFileSync(join(directory, kind), 'utf8'))).toEqual([]);
  const declarations = {
    version: 1,
    review_rules: [{ id: 'security', paths: ['src/**'], domains: ['security'], checks: ['review'] }],
    prior_confirmations: [
      { id: 'domain', domains: ['security'], reviewer_member_ids: ['member-1'], layers: ['requirements'] },
    ],
  };
  const source = stringify(declarations);
  writeFileSync(join(directory, 'Fasfile'), source);
  expect(fasfileSchema.parse(parse(source))).toEqual(declarations);
  expect(cli('check').status).toBe(0);
  for (const field of ['domains', 'reviewer_member_ids']) {
    const invalid = structuredClone(declarations);
    delete (invalid.prior_confirmations[0] as Record<string, unknown>)[field];
    const text = stringify(invalid);
    writeFileSync(join(directory, 'Fasfile'), text);
    const result = cli('check');
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: 'FASRUN_CHECK_FAILED', message: validateRepoConfig('Fasfile', text).join('\n') },
    });
  }
  writeFileSync(join(directory, 'fasrun.yaml'), 'version: 1\nspec_root: ../outside/\n');
  const outside = cli('check');
  expect(outside.status).toBe(1);
  expect(outside.stdout).toContain('canonical repository-relative path');
}, 30_000);

it('TC-SF5-PLATFORM-001 check rejects symlink roots and intermediate directories escaping the repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fasrun-config-links-'));
  const outside = mkdtempSync(join(tmpdir(), 'fasrun-config-outside-'));
  directories.push(directory, outside);
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, [bin, ...args, '--json'], { cwd: directory, encoding: 'utf8' });
  expect(cli('init').status).toBe(0);
  mkdirSync(join(outside, 'specs'));
  symlinkSync(outside, join(directory, 'linked'), 'dir');
  for (const root of ['linked/', 'linked/specs/']) {
    writeFileSync(join(directory, 'fasrun.yaml'), `version: 1\nspec_root: ${root}\n`);
    const result = cli('check');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('resolved path escapes the repository');
  }
  symlinkSync(join(directory, 'fasrun'), join(directory, 'internal'), 'dir');
  writeFileSync(join(directory, 'fasrun.yaml'), 'version: 1\nspec_root: internal/\n');
  expect(cli('check').status).toBe(0);
  writeFileSync(join(directory, 'fasrun.yaml'), 'version: 1\nspec_root: absent/\n');
  expect(cli('check').status).toBe(3);
  // Explicit spec validation retains its deliberate external-directory semantics.
  expect(cli('spec', 'validate', outside).status).toBe(0);
}, 30_000);
