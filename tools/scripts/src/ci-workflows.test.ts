// CI workflows (SF-1 T004, D-16).
// TC-PLATFORM-039 — R-platform-012.S3: a PR that changes a package without a changeset is stopped.
// TC-PLATFORM-040 — R-platform-012.S4: workflow tokens are read-only by default.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const WORKFLOWS = join(REPO_ROOT, '.github/workflows');

interface Workflow {
  on?: unknown;
  permissions?: unknown;
  jobs: Record<string, { permissions?: unknown; steps?: { uses?: string; run?: string }[] }>;
}

const workflows = () =>
  readdirSync(WORKFLOWS)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => ({ name, doc: parse(readFileSync(join(WORKFLOWS, name), 'utf8')) as Workflow }));

const isReadOnly = (permissions: unknown) =>
  permissions === 'read-all' ||
  (typeof permissions === 'object' &&
    permissions !== null &&
    Object.values(permissions).every((level) => level === 'read' || level === 'none'));

describe('workflow permissions (R-platform-012.S4)', () => {
  it('TC-PLATFORM-040 every workflow declares read-only permissions at the top level', () => {
    const found = workflows();
    expect(found.map((w) => w.name)).toContain('ci.yml');
    for (const { name, doc } of found) {
      expect(isReadOnly(doc.permissions), `${name}: top-level permissions`).toBe(true);
      expect(JSON.stringify(doc.on ?? {}), `${name}: trigger`).not.toContain('pull_request_target');
    }
  });

  it('pins every third-party action to a commit SHA', () => {
    for (const { name, doc } of workflows()) {
      for (const [job, { steps = [] }] of Object.entries(doc.jobs)) {
        for (const { uses } of steps) {
          if (uses && !uses.startsWith('./')) expect(uses, `${name} ${job}`).toMatch(/@[0-9a-f]{40}$/);
        }
      }
    }
  });

  it('lists every CI job among the Fasfile required checks', () => {
    const ci = workflows().find((w) => w.name === 'ci.yml');
    const fasfile = parse(readFileSync(join(REPO_ROOT, 'Fasfile'), 'utf8')) as {
      quality_gates: { required_checks: string[] };
    };
    expect(fasfile.quality_gates.required_checks).toEqual(expect.arrayContaining(Object.keys(ci?.doc.jobs ?? {})));
  });
});

describe('changesets check (R-platform-012.S3)', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('TC-PLATFORM-039 changing a package without a changeset fails the check; adding one passes', () => {
    const ci = workflows().find((w) => w.name === 'ci.yml');
    const runs = (ci?.doc.jobs.changesets?.steps ?? []).map((step) => step.run ?? '').join('\n');
    expect(runs).toContain('changeset status --since=');

    dir = mkdtempSync(join(tmpdir(), 'changesets-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    write('package.json', JSON.stringify({ name: 'fixture', private: true }));
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
    write('packages/contracts-core/package.json', JSON.stringify({ name: '@fasrun/contracts-core', version: '0.1.0' }));
    write('packages/contracts-core/src/index.ts', 'export const version = 1;\n');
    mkdirSync(join(dir, '.changeset'));
    copyFileSync(join(REPO_ROOT, '.changeset/config.json'), join(dir, '.changeset/config.json'));
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'feature');
    write('packages/contracts-core/src/index.ts', 'export const version = 2;\n');
    git('commit', '-qam', 'change the package');

    const changeset = join(REPO_ROOT, 'node_modules/.bin/changeset');
    const status = () => spawnSync(changeset, ['status', '--since=main'], { cwd: dir, encoding: 'utf8' });
    const without = status();
    expect(without.status, without.stdout + without.stderr).not.toBe(0);

    write('.changeset/bump-contracts.md', '---\n"@fasrun/contracts-core": patch\n---\n\nBump.\n');
    git('add', '.');
    git('commit', '-qm', 'add a changeset');
    const withChangeset = status();
    expect(withChangeset.status, withChangeset.stdout + withChangeset.stderr).toBe(0);
  });
});
