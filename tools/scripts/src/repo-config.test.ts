// Repository config and naming checks (SF-2).
// TC-PLATFORM-051 — R-platform-017.S1: the repository's fasrun.yaml and Fasfile pass the complete schema.
// TC-PLATFORM-052 — R-platform-017.S2: unknown top-level keys and a wrong version are rejected.
// TC-PLATFORM-053 — R-platform-017.S3: fasrun.local.yaml is ignored by git.
// TC-PLATFORM-054 — R-platform-018.S1: no old names from the residue check configuration remain.
// TC-PLATFORM-055 — R-platform-018.S2: workspace packages use the new names.
// TC-PLATFORM-056 — R-platform-018.S3: README and CONTRIBUTING follow the brand rules.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { findOldNames, loadOldNames, OLD_NAMES_CONFIG } from './old-names.js';
import { validateRepoConfig } from './repo-config.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');
const trackedFiles = () =>
  execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

const ENTITY_SENTENCE =
  '帆驭 (Fasrun) 是一套 Spec 驱动的面向软件交付团队的 AI Agent 控制平面与运行时基础设施。它通过 Fasfile 将企业治理公理与安全约束（Guardrails）代码化，为自主 Agent 提供确定性执行保障。';

describe('repository config (R-platform-017)', () => {
  it('TC-PLATFORM-051 fasrun.yaml and Fasfile pass the complete schema', () => {
    expect(validateRepoConfig('fasrun.yaml', read('fasrun.yaml'))).toEqual([]);
    expect(validateRepoConfig('Fasfile', read('Fasfile'))).toEqual([]);
    expect((parse(read('fasrun.yaml')) as { spec_root: string }).spec_root).toBe('fasrun/');
    const fasfile = parse(read('Fasfile')) as {
      high_risk_paths: string[];
      stack: Record<string, string>;
      quality_gates: { coverage: { application_lines: number; security_branches: number } };
    };
    expect(fasfile.quality_gates.coverage).toEqual({ application_lines: 80, security_branches: 90 });
    expect(fasfile.high_risk_paths).toEqual(expect.arrayContaining(['.github/', 'fasrun/specs/']));
    expect(fasfile.stack).toMatchObject({
      node: '24',
      pnpm: '12',
      typescript: '6.0',
      eslint: '10.13',
      vitest: '4.1.12',
    });
  });

  it('TC-PLATFORM-052 unknown top-level keys and a wrong version are rejected', () => {
    expect(validateRepoConfig('Fasfile', 'version: 1\nallow_everything: true\n')).toEqual([
      'Fasfile: unknown top-level key "allow_everything"',
    ]);
    expect(validateRepoConfig('Fasfile', 'version: 2\n')).toEqual(['Fasfile: version must be 1, got 2']);
    expect(validateRepoConfig('fasrun.yaml', 'version: 1\n')).toEqual(['fasrun.yaml: spec_root must be a string']);
    expect(validateRepoConfig('Fasfile', '- not a mapping\n')).toEqual(['Fasfile: the top level must be a mapping']);
  });

  it('TC-PLATFORM-052 rejects nested unknown fields, types and escaping paths', () => {
    for (const text of [
      'version: 1\nquality_gates: {coverage: {unknown: 90}}',
      'version: 1\nstack: {node: 24}',
      'version: 1\nprotected_paths: [../secret]',
    ]) {
      expect(validateRepoConfig('Fasfile', text).length).toBeGreaterThan(0);
    }
  });

  it('TC-SF5-PLATFORM-001 CI preserves valid declarations and locates missing confirmation fields', () => {
    const valid =
      'version: 1\nreview_rules: [{id: security, paths: [src/], checks: [review]}]\nprior_confirmations: [{id: security, domains: [security], reviewer_member_ids: [member-id], layers: [requirements]}]';
    expect(validateRepoConfig('Fasfile', valid)).toEqual([]);
    for (const field of ['domains', 'reviewer_member_ids']) {
      const invalid = valid.replace(new RegExp(`${field}: \\[[^\\]]+\\], `), '');
      expect(validateRepoConfig('Fasfile', invalid).join('\n')).toContain(`prior_confirmations.0.${field}`);
    }
  });

  it('TC-PLATFORM-053 fasrun.local.yaml is ignored by git', () => {
    const result = spawnSync('git', ['check-ignore', '-q', 'fasrun.local.yaml'], { cwd: REPO_ROOT });
    expect(result.status).toBe(0);
  });
});

describe('naming and brand (R-platform-018)', () => {
  it('TC-PLATFORM-054 no old names from tools/scripts/old-names.yaml remain', () => {
    const config = loadOldNames(join(REPO_ROOT, OLD_NAMES_CONFIG));
    // R-platform-018 fixes the exceptions: the list itself, GradoAI/sf-optio and the SF-2 archive directory.
    expect(config.exceptions).toEqual({
      files: [OLD_NAMES_CONFIG],
      directories: ['fasrun/changes/archive/*-SF-2-rename-fasrun/'],
      text: ['GradoAI/sf-optio'],
    });
    expect(config.names.length).toBeGreaterThan(0);
    expect(findOldNames(config, trackedFiles(), read)).toEqual([]);
  });

  it('TC-PLATFORM-055 workspace packages use the new names', () => {
    const names = trackedFiles()
      .filter((path) => path.endsWith('package.json'))
      .map((path) => [path, (JSON.parse(read(path)) as { name: string }).name] as const);
    for (const [path, name] of names) {
      if (path === 'package.json') expect(name).toBe('fasrun');
      else expect(name, path).toMatch(/^@fasrun\//);
    }
  });

  it('TC-PLATFORM-056 README and CONTRIBUTING follow the brand rules', () => {
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
