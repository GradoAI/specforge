import { describe, expect, it } from 'vitest';
import { fasfileSchema } from '@fasrun/plugin-spec-common';
import { tightenProjectConstraints } from './constraints.js';
import { assertOrdinaryWritesAllowed, matchesRepositoryGlob, projectReviewRequirements } from './paths.js';
const base = fasfileSchema.parse({
  version: 1,
  principles: ['Human review'],
  stack: { node: '24' },
  agent: { commands: ['test', 'build'] },
  quality_gates: {
    required_checks: ['lint'],
    coverage: { application_lines: 80, security_branches: 90 },
    flaky_quarantine_days: 3,
    bugfix_requires_reproducing_test: true,
    patch_release_without_migrations_or_contract_changes: true,
  },
  protected_paths: ['fasrun/changes/archive/**'],
  high_risk_paths: ['auth/'],
});
describe('TC-SF5-SPEC-008 inherited constraints', () => {
  it('inherits without a Fasfile, intersects capabilities and unions additional requirements', () => {
    const inherited = tightenProjectConstraints(base, undefined, ['test']);
    expect(inherited.agent?.commands).toEqual(['test']);
    expect(inherited.quality_gates?.coverage?.application_lines).toBe(80);
    const requested = fasfileSchema.parse({
      version: 1,
      principles: ['Tests'],
      quality_gates: { required_checks: ['test'], coverage: { application_lines: 85 }, flaky_quarantine_days: 1 },
      protected_paths: ['private/**'],
    });
    const result = tightenProjectConstraints(base, requested, ['test', 'build']);
    expect(result.quality_gates?.required_checks).toEqual(['lint', 'test']);
    expect(result.quality_gates?.coverage).toEqual({ application_lines: 85, security_branches: 90 });
    expect(result.protected_paths).toEqual(['fasrun/changes/archive/**', 'private/**']);
    expect(result.principles).toEqual(['Human review', 'Tests']);
    expect(result.quality_gates?.flaky_quarantine_days).toBe(1);
  });
  it('rejects explicit relaxation, incomparable stack declarations and replacement rules', () => {
    for (const extra of [
      { agent: { commands: ['publish'] } },
      { quality_gates: { coverage: { application_lines: 79 } } },
      { quality_gates: { coverage: { security_branches: 89 } } },
      { quality_gates: { flaky_quarantine_days: 4 } },
      { quality_gates: { bugfix_requires_reproducing_test: false } },
      { quality_gates: { patch_release_without_migrations_or_contract_changes: false } },
      { stack: { node: '25' } },
    ])
      expect(() =>
        tightenProjectConstraints(base, fasfileSchema.parse({ version: 1, ...extra }), ['test', 'build']),
      ).toThrow();
    const rules = fasfileSchema.parse({
      version: 1,
      review_rules: [{ id: 'security', domains: ['auth'], checks: ['security'] }],
      prior_confirmations: [{ id: 'cost', domains: ['cost'], reviewer_member_ids: ['m1'], layers: ['requirements'] }],
    });
    expect(tightenProjectConstraints(rules, rules, []).review_rules).toEqual(rules.review_rules);
    expect(() =>
      tightenProjectConstraints(
        rules,
        fasfileSchema.parse({ version: 1, review_rules: [{ id: 'security', domains: ['auth'], checks: [] }] }),
        [],
      ),
    ).toThrow('mandatory rule');
    expect(() =>
      tightenProjectConstraints(
        rules,
        fasfileSchema.parse({
          version: 1,
          prior_confirmations: [
            { id: 'cost', domains: ['cost'], reviewer_member_ids: ['m2'], layers: ['requirements'] },
          ],
        }),
        [],
      ),
    ).toThrow('mandatory rule');
  });
  it('TC-SF5-SPEC-009 matches bounded globs and rejects ordinary writes to protected historical files', () => {
    for (const [pattern, path, expected] of [
      ['**/spec.md', 'spec.md', true],
      ['**/spec.md', 'a/b/spec.md', true],
      ['auth/', 'auth/a.ts', true],
      ['a/*.ts', 'a/b/c.ts', false],
      ['a/*.ts', 'a/b.ts', true],
      ['a/*.ts', 'b/b.ts', false],
      ['a/**', 'a', true],
      ['a', 'a/b', false],
      ['docs/🔒.md', 'docs/🔒.md', true],
      ['docs/🔒*.md', 'docs/🔒secret.md', true],
    ] as const)
      expect(matchesRepositoryGlob(pattern, path)).toBe(expected);
    expect(matchesRepositoryGlob(Array(30).fill('**').join('/') + '/never', Array(30).fill('a').join('/'))).toBe(false);
    expect(matchesRepositoryGlob('*a'.repeat(30) + 'z', 'a'.repeat(60))).toBe(false);
    expect(() => matchesRepositoryGlob('../escape', 'a')).toThrow();
    expect(() => assertOrdinaryWritesAllowed(base, ['../outside'])).toThrow();
    expect(() => assertOrdinaryWritesAllowed(base, ['fasrun/changes/archive/2026-old/spec.md'])).toThrow('Protected');
    expect(() => assertOrdinaryWritesAllowed(base, ['src/valid.ts'])).not.toThrow();
    expect(() => assertOrdinaryWritesAllowed({ ...base, protected_paths: ['docs/🔒.md'] }, ['docs/🔒.md'])).toThrow(
      'Protected',
    );
    const rules = fasfileSchema.parse({
      ...base,
      review_rules: [{ id: 'auth', paths: ['auth/**'], checks: ['security'] }],
      prior_confirmations: [{ id: 'cost', domains: ['cost'], reviewer_member_ids: ['m1'], layers: ['requirements'] }],
    });
    expect(projectReviewRequirements(rules, ['auth/session.ts'], ['cost'], 'requirements')).toMatchObject({
      checks: ['security'],
      highRisk: true,
      priorConfirmations: [{ id: 'cost' }],
    });
    expect(projectReviewRequirements(rules, ['src/a.ts'], [], 'design')).toEqual({
      checks: [],
      highRisk: false,
      priorConfirmations: [],
    });
    expect(() => projectReviewRequirements(rules, ['../outside'], [], 'design')).toThrow();
  });
});
