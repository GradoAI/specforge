import { z } from 'zod';
import { parse } from 'yaml';

export const SUPPORTED_VERSION = 1;
export type RepoConfigKind = 'fasrun.yaml' | 'Fasfile';
const text = z.string().trim().min(1);

/** Canonical relative paths; globs allow only * within a segment or ** as a whole segment. */
export function isRepositoryPath(value: string, glob = false): boolean {
  if (!value || value.trim() !== value || /[\\\s\p{Cc}:?[\]{}!%]/u.test(value)) return false;
  const segments = value.replace(/\/$/, '').split('/');
  return segments.every((segment) => {
    if (!segment || segment === '.' || segment === '..') return false;
    if (!glob) return !segment.includes('*');
    return segment === '**' || !segment.includes('**');
  });
}
export const repositoryPathSchema = z
  .string()
  .refine((value) => isRepositoryPath(value), 'must be a canonical repository-relative path');
export const repositoryGlobSchema = z
  .string()
  .refine((value) => isRepositoryPath(value, true), 'must be a canonical repository-relative path or restricted glob');
const strings = z.array(text);
const reviewRuleSchema = z
  .strictObject({
    id: text,
    paths: z.array(repositoryGlobSchema).default([]),
    domains: strings.default([]),
    checks: strings,
  })
  .refine((rule) => rule.paths.length + rule.domains.length > 0, {
    path: ['domains'],
    message: 'at least one path or domain is required',
  });
const priorConfirmationSchema = z.strictObject({
  id: text,
  domains: strings.min(1),
  reviewer_member_ids: strings.min(1),
  layers: z.array(z.enum(['requirements', 'design'])).min(1),
});
function uniqueIds<T extends { id: string }>(values: T[], context: z.RefinementCtx) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'id must be unique' });
    seen.add(value.id);
  });
}
export const fasrunConfigSchema = z.strictObject({
  version: z.literal(SUPPORTED_VERSION),
  project: text.optional(),
  spec_root: repositoryPathSchema,
  spec_template: text.optional(),
  shared_files: z.array(repositoryPathSchema).optional(),
});
export const fasfileSchema = z.strictObject({
  version: z.literal(SUPPORTED_VERSION),
  principles: strings.optional(),
  stack: z.record(text, text).optional(),
  quality_gates: z
    .strictObject({
      required_checks: strings.optional(),
      coverage: z
        .strictObject({
          application_lines: z.number().min(0).max(100).optional(),
          security_branches: z.number().min(0).max(100).optional(),
        })
        .optional(),
      flaky_quarantine_days: z.number().int().nonnegative().optional(),
      bugfix_requires_reproducing_test: z.boolean().optional(),
      patch_release_without_migrations_or_contract_changes: z.boolean().optional(),
    })
    .optional(),
  protected_paths: z.array(repositoryGlobSchema).optional(),
  high_risk_paths: z.array(repositoryGlobSchema).optional(),
  agent: z.strictObject({ commands: strings }).optional(),
  review_rules: z.array(reviewRuleSchema).superRefine(uniqueIds).default([]),
  prior_confirmations: z.array(priorConfirmationSchema).superRefine(uniqueIds).default([]),
});
export type FasrunConfig = z.infer<typeof fasrunConfigSchema>;
export type Fasfile = z.infer<typeof fasfileSchema>;

/** One parser and diagnostic formatter for CLI, CI and templates. No context-dependent authorization here. */
export function validateRepoConfig(kind: RepoConfigKind, source: string): string[] {
  let doc: unknown;
  try {
    doc = parse(source);
  } catch (error) {
    return [`${kind}: invalid YAML: ${(error as Error).message}`];
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc))
    return [`${kind}: the top level must be a mapping`];
  const result = (kind === 'Fasfile' ? fasfileSchema : fasrunConfigSchema).safeParse(doc);
  if (result.success) return [];
  return result.error.issues.flatMap((issue) => {
    const path = issue.path.join('.');
    if (path === 'version')
      return [
        `${kind}: version must be ${SUPPORTED_VERSION}, got ${JSON.stringify((doc as Record<string, unknown>).version)}`,
      ];
    if (issue.code === 'unrecognized_keys')
      return issue.keys.map(
        (key) => `${kind}: ${path ? `${path}.${key}: unknown field` : `unknown top-level key "${key}"`}`,
      );
    if (path === 'spec_root' && issue.code === 'invalid_type') return [`${kind}: spec_root must be a string`];
    return [`${kind}: ${path}: ${issue.message}`];
  });
}
