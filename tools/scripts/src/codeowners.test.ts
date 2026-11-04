// CODEOWNERS checks (SF-1 T003).
// TC-PLATFORM-007 — R-platform-003.S1: every path has an owner other than the author.
// TC-PLATFORM-008 — R-platform-003.S2: spec paths belong to the requirements reviewer.
// TC-PLATFORM-009 — R-platform-003.S3: CI configuration belongs to PontusAI alone.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCodeOwners, ownersOf, parseCodeOwners, patternToRegExp } from './codeowners.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const rules = loadCodeOwners(join(REPO_ROOT, '.github/CODEOWNERS'));
const REQUIREMENTS_REVIEWER = '@PontusAI';
// Rules that intentionally give a path to one person (R-platform-003).
const SINGLE_OWNER_PATTERNS = ['/specforge/specs/', '/specforge/changes/**/requirements.md', '/.github/'];

/** Tracked files plus paths that later tasks will create, so the check does not depend on today's tree. */
function samplePaths(): string[] {
  const tracked = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  return [
    ...tracked,
    'apps/sf-core-svc/src/index.ts',
    'packages/backend-plugin-api/src/index.ts',
    'plugins/identity/identity-backend/migrations/0000_init.sql',
    'deploy/helm/specforge/values.yaml',
    'docs/README.md',
    'specforge/changes/SF-1-engineering-skeleton/design.md',
    'specforge/changes/SF-1-engineering-skeleton/specs/platform/spec.md',
    'specforge/changes/archive/2026-11-30-SF-1-engineering-skeleton/requirements.md',
    'specforge/specs/platform/spec.md',
    '.github/workflows/ci.yml',
  ];
}

describe('CODEOWNERS pattern semantics (GitHub documentation examples)', () => {
  const matches = (pattern: string, path: string) => patternToRegExp(pattern).test(path);

  it('matches unanchored patterns anywhere and anchored patterns from the root', () => {
    expect(matches('*.js', 'src/app/index.js')).toBe(true);
    expect(matches('apps/', 'apps/x.ts')).toBe(true);
    expect(matches('apps/', 'deep/apps/x.ts')).toBe(true); // only a trailing slash: an apps directory anywhere
    expect(matches('/apps/github', 'apps/github/x.ts')).toBe(true); // a file pattern may name a directory
    expect(matches('/docs/', 'docs/a/b.md')).toBe(true);
    expect(matches('/docs/', 'x/docs/b.md')).toBe(false);
  });

  it('keeps single * within a segment and lets ** cross directories', () => {
    expect(matches('docs/*', 'docs/getting-started.md')).toBe(true);
    expect(matches('docs/*', 'docs/build-app/troubleshooting.md')).toBe(false);
    expect(matches('**/logs', 'build/logs/x.log')).toBe(true);
    expect(matches('/specforge/changes/**/requirements.md', 'specforge/changes/SF-1-x/requirements.md')).toBe(true);
    expect(matches('/specforge/changes/**/requirements.md', 'specforge/changes/SF-1-x/design.md')).toBe(false);
  });

  it('uses the last matching rule and lets a rule without owners remove ownership', () => {
    const r = parseCodeOwners('* @a @b\n/apps/ @c\n/apps/github\n');
    expect(ownersOf(r, 'apps/x.ts').owners).toEqual(['@c']);
    expect(ownersOf(r, 'apps/github/x.ts').owners).toEqual([]);
    expect(ownersOf(r, 'README.md').owners).toEqual(['@a', '@b']);
  });

  it('rejects syntax GitHub does not support', () => {
    expect(() => parseCodeOwners('!secret.txt @a')).toThrow(/unsupported/);
    expect(() => parseCodeOwners('[abc].md @a')).toThrow(/unsupported/);
  });
});

describe('repository CODEOWNERS', () => {
  it('TC-PLATFORM-007 every path has an owner other than the author; only designated paths have one owner', () => {
    for (const path of samplePaths()) {
      const { owners, rule } = ownersOf(rules, path);
      expect(owners.length, `${path} has no owner`).toBeGreaterThan(0);
      if (owners.length < 2) {
        expect(SINGLE_OWNER_PATTERNS, `${path} has a single owner via "${rule?.pattern}"`).toContain(rule?.pattern);
      }
    }
  });

  it('TC-PLATFORM-008 current specs and requirements layers belong to the requirements reviewer', () => {
    for (const path of [
      'specforge/specs/platform/spec.md',
      'specforge/changes/SF-1-engineering-skeleton/requirements.md',
    ]) {
      expect(ownersOf(rules, path).owners, path).toEqual([REQUIREMENTS_REVIEWER]);
    }
  });

  it('TC-PLATFORM-009 CI configuration belongs to PontusAI alone', () => {
    for (const path of ['.github/workflows/ci.yml', '.github/CODEOWNERS']) {
      expect(ownersOf(rules, path).owners, path).toEqual(['@PontusAI']);
    }
  });
});
