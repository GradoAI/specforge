// Minimal schema for fasrun.yaml and Fasfile (SF-2, R-platform-017).
// Only `version` and the known top-level keys are checked; the full schema ships with the spec plugin in M1.
import { parse } from 'yaml';

export type RepoConfigKind = 'fasrun.yaml' | 'Fasfile';

export const SUPPORTED_VERSION = 1;

const KNOWN_KEYS: Record<RepoConfigKind, readonly string[]> = {
  'fasrun.yaml': ['version', 'project', 'spec_root', 'spec_template', 'shared_files'],
  Fasfile: ['version', 'principles', 'stack', 'quality_gates', 'protected_paths', 'high_risk_paths', 'agent'],
};

/** Returns the validation errors of one repository config file; an empty list means valid. */
export function validateRepoConfig(kind: RepoConfigKind, text: string): string[] {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (error) {
    return [`${kind}: invalid YAML: ${(error as Error).message}`];
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return [`${kind}: the top level must be a mapping`];
  }
  const record = doc as Record<string, unknown>;
  const errors: string[] = [];
  if (record.version !== SUPPORTED_VERSION) {
    errors.push(`${kind}: version must be ${SUPPORTED_VERSION}, got ${JSON.stringify(record.version)}`);
  }
  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS[kind].includes(key)) errors.push(`${kind}: unknown top-level key "${key}"`);
  }
  if (kind === 'fasrun.yaml' && typeof record.spec_root !== 'string') {
    errors.push('fasrun.yaml: spec_root must be a string');
  }
  return errors;
}
