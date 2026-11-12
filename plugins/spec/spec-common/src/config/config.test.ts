import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { fasfileSchema, fasrunConfigSchema, isRepositoryPath, validateRepoConfig } from './index.js';

const rule = { id: 'security', paths: ['src/**/auth*.ts'], domains: ['security'], checks: ['security-review'] };
const confirmation = {
  id: 'architecture',
  domains: ['architecture'],
  reviewer_member_ids: ['member-1'],
  layers: ['requirements', 'design'],
};
const valid = { version: 1, review_rules: [rule], prior_confirmations: [confirmation] };

describe('TC-SF5-PLATFORM-001 complete configuration contract', () => {
  it('retains declarations, permits old minimal configs and defaults only new optional declarations', () => {
    expect(fasfileSchema.parse(valid)).toEqual(valid);
    expect(fasfileSchema.parse({ version: 1 })).toEqual({ version: 1, review_rules: [], prior_confirmations: [] });
    expect(
      fasfileSchema.parse({
        version: 1,
        review_rules: [
          { id: 'path', paths: ['src/'], checks: [] },
          { id: 'domain', domains: ['security'], checks: [] },
        ],
      }).review_rules,
    ).toHaveLength(2);
    expect(
      fasrunConfigSchema.parse({
        version: 1,
        spec_root: 'fasrun/',
        project: 'demo',
        spec_template: 'default@1',
        shared_files: ['.changeset/'],
      }).project,
    ).toBe('demo');
  });
  it.each([
    { review_rules: [{ ...rule, id: '' }] },
    { review_rules: [{ ...rule, paths: [], domains: [] }] },
    { review_rules: [{ id: 'empty', checks: [] }] },
    { review_rules: [{ ...rule, checks: undefined }] },
    { review_rules: [{ ...rule, extra: true }] },
    { review_rules: [rule, rule] },
    { prior_confirmations: [confirmation, confirmation] },
    { prior_confirmations: [{ ...confirmation, domains: [] }] },
    { prior_confirmations: [{ ...confirmation, domains: undefined }] },
    { prior_confirmations: [{ ...confirmation, reviewer_member_ids: [] }] },
    { prior_confirmations: [{ ...confirmation, reviewer_member_ids: undefined }] },
    { prior_confirmations: [{ ...confirmation, layers: [] }] },
    { prior_confirmations: [{ ...confirmation, layers: ['tasks'] }] },
    { prior_confirmations: [{ ...confirmation, extra: true }] },
    { principles: [1] },
    { stack: { node: 24 } },
    { agent: { commands: 'pnpm test' } },
    { quality_gates: { coverage: { application_lines: 101 } } },
    { quality_gates: { coverage: { security_branches: -1 } } },
    { quality_gates: { coverage: { unknown: 90 } } },
    { quality_gates: { unknown: true } },
    { quality_gates: { flaky_quarantine_days: 1.5 } },
    { quality_gates: { bugfix_requires_reproducing_test: 'true' } },
    { agent: { commands: [], unknown: true } },
  ])('rejects invalid nested declarations: %j', (override) => {
    const errors = validateRepoConfig('Fasfile', stringify({ ...valid, ...override }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((error) => error.startsWith('Fasfile: '))).toBe(true);
  });
  it.each([
    '',
    '/',
    '/tmp/x',
    '../x',
    'a/../x',
    './x',
    'a//b',
    'a\\b',
    'C:/x',
    'a?b',
    'a[bc]',
    '{a,b}',
    '!a',
    'a/**b',
    ' a',
    'a ',
    'a\u0000b',
    'a/%2e%2e/b',
  ])('rejects noncanonical or unrestricted glob %j', (path) => {
    expect(isRepositoryPath(path, true)).toBe(false);
    expect(validateRepoConfig('Fasfile', stringify({ version: 1, high_risk_paths: [path] })).length).toBeGreaterThan(0);
  });
  it('accepts supported glob syntax and rejects glob spec roots/shared files', () => {
    for (const path of ['**/migrations/', '**/package.json', '.github/', 'src/*.ts', 'fasrun/specs/'])
      expect(isRepositoryPath(path, true)).toBe(true);
    expect(isRepositoryPath('src/*')).toBe(false);
    expect(fasrunConfigSchema.safeParse({ version: 1, spec_root: 'fasrun/*' }).success).toBe(false);
    expect(fasrunConfigSchema.safeParse({ version: 1, spec_root: 'fasrun/', shared_files: ['**/x'] }).success).toBe(
      false,
    );
  });
  it('provides deterministic file and field diagnostics for all entry points', () => {
    expect(validateRepoConfig('Fasfile', 'version: 1\n')).toEqual([]);
    expect(validateRepoConfig('Fasfile', 'version: 2\n')).toEqual(['Fasfile: version must be 1, got 2']);
    expect(validateRepoConfig('Fasfile', 'version: 1\nunknown: true\n')).toEqual([
      'Fasfile: unknown top-level key "unknown"',
    ]);
    expect(validateRepoConfig('fasrun.yaml', 'version: 1\n')).toEqual(['fasrun.yaml: spec_root must be a string']);
    for (const source of ['', '- list', 'true'])
      expect(validateRepoConfig('Fasfile', source)).toEqual(['Fasfile: the top level must be a mapping']);
    expect(validateRepoConfig('Fasfile', 'version: [')[0]).toContain('invalid YAML:');
    expect(validateRepoConfig('Fasfile', stringify({ version: 1, quality_gates: { coverage: { extra: 1 } } }))).toEqual(
      ['Fasfile: quality_gates.coverage.extra: unknown field'],
    );
  });
});
