// "Spec before code" check (SF-1 T004, D-16).
// TC-PLATFORM-037 — R-platform-012.S1: a code PR that does not reference an existing task is stopped.
// TC-PLATFORM-038 — R-platform-012.S2: a PR that only changes specs is not restricted.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSpecFirst, collectFromGit, isExempt } from './spec-first.js';

const TASKS = new Map([
  [
    'fasrun/changes/SF-1-engineering-skeleton/tasks.md',
    '# 任务\n\n- [x] T003 CLAUDE.md 与 CODEOWNERS — 对应 R-platform-003\n- [ ] T004 CI 基线 — 对应 R-platform-012\n',
  ],
  ['fasrun/changes/archive/2026-11-11-SF-2-rename-fasrun/tasks.md', '- [x] T001 改名\n'],
]);

describe('spec-first check (R-platform-012)', () => {
  it('TC-PLATFORM-037 a code PR whose task is missing from main is stopped and the missing task is named', () => {
    const result = checkSpecFirst({
      title: 'SF-1 T999 示例',
      changedFiles: ['packages/contracts-core/src/index.ts'],
      tasksFiles: TASKS,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('T999');
    expect(result.message).toContain('fasrun/changes/SF-1-engineering-skeleton/tasks.md');
  });

  it('TC-PLATFORM-038 a PR that only changes files under fasrun/ passes without a task in the title', () => {
    const result = checkSpecFirst({
      title: 'docs(spec): SF-3 需求层规格',
      changedFiles: ['fasrun/changes/SF-3-example/requirements.md', 'fasrun/changes/SF-3-example/meta.yaml'],
      tasksFiles: TASKS,
    });
    expect(result.ok).toBe(true);
  });

  it('passes a code PR that names a task listed on main', () => {
    const result = checkSpecFirst({
      title: 'SF-1 T004 CI 基线与「先规格后代码」检查',
      changedFiles: ['tools/scripts/src/spec-first.ts', '.github/workflows/ci.yml'],
      tasksFiles: TASKS,
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('SF-1 T004');
  });

  it('asks for a task reference when the title has none', () => {
    const result = checkSpecFirst({ title: 'build: bump turbo', changedFiles: ['package.json'], tasksFiles: TASKS });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('SF-<work> T<task>');
    expect(result.message).toContain('package.json');
  });

  it('stops a PR whose work has no change directory on main; archived directories do not count', () => {
    const missing = checkSpecFirst({ title: 'SF-9 T001 x', changedFiles: ['apps/x/src/a.ts'], tasksFiles: TASKS });
    expect(missing.ok).toBe(false);
    expect(missing.message).toContain('fasrun/changes/SF-9-*/');
    const archived = checkSpecFirst({ title: 'SF-2 T001 x', changedFiles: ['apps/x/src/a.ts'], tasksFiles: TASKS });
    expect(archived.ok).toBe(false);
  });

  it('exempts specs, docs, Markdown and CI configuration only', () => {
    for (const path of [
      'fasrun/specs/platform/spec.md',
      'docs/a.md',
      'README.md',
      'apps/x/README.md',
      '.github/CODEOWNERS',
    ]) {
      expect(isExempt(path), path).toBe(true);
    }
    for (const path of ['package.json', 'tools/scripts/src/a.ts', 'Fasfile', 'pnpm-lock.yaml']) {
      expect(isExempt(path), path).toBe(false);
    }
  });
});

describe('collectFromGit', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('reports both sides of a rename and reads tasks.md from the base branch only', () => {
    dir = mkdtempSync(join(tmpdir(), 'spec-first-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    write('fasrun/changes/SF-1-x/tasks.md', '- [ ] T004 CI\n');
    write('packages/a/src/index.ts', 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'feature');
    git('mv', 'packages/a/src/index.ts', 'fasrun/a.ts');
    write('fasrun/changes/SF-5-y/tasks.md', '- [ ] T001 new\n');
    git('add', '.');
    git('commit', '-qm', 'move');

    const { changedFiles, tasksFiles } = collectFromGit('main', dir);
    expect([...changedFiles].sort()).toEqual([
      'fasrun/a.ts',
      'fasrun/changes/SF-5-y/tasks.md',
      'packages/a/src/index.ts',
    ]);
    expect([...tasksFiles.keys()]).toEqual(['fasrun/changes/SF-1-x/tasks.md']);
  });
});
