import { fasfileSchema, type Fasfile } from '@fasrun/plugin-spec-common';

export class ConstraintConflict extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`${path}: ${reason}`);
  }
}
const union = (left: readonly string[] = [], right: readonly string[] = []) => [...new Set([...left, ...right])];
function mergeRules<T extends { id: string }>(baseline: readonly T[], requested: readonly T[], path: string): T[] {
  const result = new Map(baseline.map((rule) => [rule.id, rule]));
  for (const rule of requested) {
    const previous = result.get(rule.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(rule)) {
      throw new ConstraintConflict(`${path}.${rule.id}`, 'cannot replace an existing mandatory rule');
    }
    result.set(rule.id, rule);
  }
  return [...result.values()];
}
/** A project can add constraints, never erase inherited restrictions. Missing declarations inherit. */
export function tightenProjectConstraints(
  organization: Fasfile,
  project: Fasfile | undefined,
  allowedCapabilities: readonly string[],
): Fasfile {
  const baseline = fasfileSchema.parse(organization);
  const requested = fasfileSchema.parse(project ?? { version: 1 });
  const commands = baseline.agent?.commands ?? [...allowedCapabilities];
  const permitted = commands.filter((command) => allowedCapabilities.includes(command));
  const selected = requested.agent?.commands ?? permitted;
  for (const command of selected)
    if (!permitted.includes(command))
      throw new ConstraintConflict('agent.commands', `capability not allowed: ${command}`);
  const stack = { ...baseline.stack };
  for (const [key, value] of Object.entries(requested.stack ?? {})) {
    if (stack[key] !== undefined && stack[key] !== value)
      throw new ConstraintConflict(`stack.${key}`, 'different declarations cannot be compared as tightening');
    stack[key] = value;
  }
  const lower = baseline.quality_gates ?? {};
  const upper = requested.quality_gates ?? {};
  const coverage = { ...lower.coverage };
  for (const key of ['application_lines', 'security_branches'] as const) {
    const value = upper.coverage?.[key];
    if (value !== undefined) {
      if (value < (coverage[key] ?? 0))
        throw new ConstraintConflict(`quality_gates.coverage.${key}`, 'below inherited minimum');
      coverage[key] = value;
    }
  }
  for (const key of [
    'bugfix_requires_reproducing_test',
    'patch_release_without_migrations_or_contract_changes',
  ] as const)
    if (lower[key] === true && upper[key] === false)
      throw new ConstraintConflict(`quality_gates.${key}`, 'cannot disable inherited requirement');
  if (
    lower.flaky_quarantine_days !== undefined &&
    upper.flaky_quarantine_days !== undefined &&
    upper.flaky_quarantine_days > lower.flaky_quarantine_days
  )
    throw new ConstraintConflict('quality_gates.flaky_quarantine_days', 'cannot extend inherited quarantine limit');
  return fasfileSchema.parse({
    version: 1,
    principles: union(baseline.principles, requested.principles),
    stack,
    quality_gates: {
      ...lower,
      ...upper,
      coverage,
      required_checks: union(lower.required_checks, upper.required_checks),
    },
    protected_paths: union(baseline.protected_paths, requested.protected_paths),
    high_risk_paths: union(baseline.high_risk_paths, requested.high_risk_paths),
    agent: { commands: selected },
    review_rules: mergeRules(baseline.review_rules, requested.review_rules, 'review_rules'),
    prior_confirmations: mergeRules(baseline.prior_confirmations, requested.prior_confirmations, 'prior_confirmations'),
  });
}
