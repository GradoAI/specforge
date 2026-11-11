// Repository config and naming checks (SF-2).
// TC-PLATFORM-049 — R-platform-017.S1: the repository's fasrun.yaml and Fasfile pass the minimal schema.
// TC-PLATFORM-050 — R-platform-017.S2: unknown top-level keys and a wrong version are rejected.
// TC-PLATFORM-051 — R-platform-017.S3: fasrun.local.yaml is ignored by git.
// TC-PLATFORM-052 — R-platform-018.S1: no old product names remain.
// TC-PLATFORM-053 — R-platform-018.S2: workspace packages use the new names.
// TC-PLATFORM-054 — R-platform-018.S3: README and CONTRIBUTING follow the brand rules.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateRepoConfig } from './repo-config.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');
const trackedFiles = () =>
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

const ENTITY_SENTENCE =
  '帆驭 (Fasrun) 是一套 Spec 驱动的面向软件交付团队的 AI Agent 控制平面与运行时基础设施。它通过 Fasfile 将企业治理公理与安全约束（Guardrails）代码化，为自主 Agent 提供确定性执行保障。';

describe('repository config (R-platform-017)', () => {
  it('TC-PLATFORM-049 fasrun.yaml and Fasfile pass the minimal schema', () => {
    expect(validateRepoConfig('fasrun.yaml', read('fasrun.yaml'))).toEqual([]);
    expect(validateRepoConfig('Fasfile', read('Fasfile'))).toEqual([]);
    expect((parse(read('fasrun.yaml')) as { spec_root: string }).spec_root).toBe('fasrun/');
    const fasfile = parse(read('Fasfile')) as { high_risk_paths: string[]; stack: Record<string, string> };
    expect(fasfile.high_risk_paths).toEqual(expect.arrayContaining(['.github/', 'fasrun/specs/']));
    expect(fasfile.stack).toMatchObject({
      node: '24',
      pnpm: '12',
      typescript: '6.0',
      eslint: '10.13',
      vitest: '4.1.12',
    });
  });

  it('TC-PLATFORM-050 unknown top-level keys and a wrong version are rejected', () => {
    expect(validateRepoConfig('Fasfile', 'version: 1\nallow_everything: true\n')).toEqual([
      'Fasfile: unknown top-level key "allow_everything"',
    ]);
    expect(validateRepoConfig('Fasfile', 'version: 2\n')).toEqual(['Fasfile: version must be 1, got 2']);
    expect(validateRepoConfig('fasrun.yaml', 'version: 1\n')).toEqual(['fasrun.yaml: spec_root must be a string']);
    expect(validateRepoConfig('Fasfile', '- not a mapping\n')).toEqual(['Fasfile: the top level must be a mapping']);
  });

  it('TC-PLATFORM-051 fasrun.local.yaml is ignored by git', () => {
    const result = spawnSync('git', ['check-ignore', '-q', 'fasrun.local.yaml'], { cwd: REPO_ROOT });
    expect(result.status).toBe(0);
  });
});

describe('naming and brand (R-platform-018)', () => {
  it('TC-PLATFORM-052 no old product names remain', () => {
    // Patterns are assembled so this file does not match itself.
    const oldName = new RegExp(['spec', 'forge'].join(''), 'i');
    const envPrefix = new RegExp(`\\b${'S'}F_`);
    const designToken = new RegExp(`--${'s'}f-`);
    const command = new RegExp(`(^|[^A-Za-z0-9_./-])${'s'}f([^A-Za-z0-9_-]|$)`);
    // Exceptions per R-platform-018: the archived repository name GradoAI/sf-optio, and the SF-2 change
    // directory with its archive directory, which describe the rename itself.
    const exempt = (path: string) =>
      path.startsWith('fasrun/changes/SF-2-rename-fasrun/') ||
      /^fasrun\/changes\/archive\/\d{4}-\d{2}-\d{2}-SF-2-rename-fasrun\//.test(path);
    const hits: string[] = [];
    for (const path of trackedFiles().filter((p) => !exempt(p))) {
      read(path)
        .split('\n')
        .forEach((line, index) => {
          if (line.includes('GradoAI/sf-optio')) return;
          if ([oldName, envPrefix, designToken, command].some((re) => re.test(line))) hits.push(`${path}:${index + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('TC-PLATFORM-053 workspace packages use the new names', () => {
    const names = trackedFiles()
      .filter((path) => path.endsWith('package.json'))
      .map((path) => [path, (JSON.parse(read(path)) as { name: string }).name] as const);
    for (const [path, name] of names) {
      if (path === 'package.json') expect(name).toBe('fasrun');
      else expect(name, path).toMatch(/^@fasrun\//);
    }
  });

  it('TC-PLATFORM-054 README and CONTRIBUTING follow the brand rules', () => {
    const paragraphs = read('README.md')
      .split(/\n\s*\n/)
      .map((p) => p.trim());
    const firstText = paragraphs.findIndex((p) => !p.startsWith('#') && !p.includes('https://fasrun.dev'));
    expect(paragraphs.slice(0, firstText).join('\n')).toContain('https://fasrun.dev');
    expect(paragraphs[firstText]).toBe(ENTITY_SENTENCE);
    expect(read('CONTRIBUTING.md')).toContain('docs/brand-and-naming.md');
    expect(read('docs/brand-and-naming.md')).toContain('**版本**：v1.3');
  });
});
