import { isRepositoryPath, type Fasfile } from '@fasrun/plugin-spec-common';

/** Segment matching rather than an executable regexp supplied by repository content. */
export function matchesRepositoryGlob(pattern: string, path: string): boolean {
  if (pattern.length > 4096 || path.length > 4096 || !isRepositoryPath(pattern, true) || !isRepositoryPath(path))
    throw new Error('Invalid repository path or pattern');
  const glob = pattern.replace(/\/$/, '').split('/');
  const parts = path.replace(/\/$/, '').split('/');
  const memo = new Map<string, boolean>();
  function segmentMatches(pattern: string, value: string): boolean {
    let previous = Array<boolean>(value.length + 1).fill(false);
    previous[0] = true;
    for (const token of pattern.split('')) {
      const next = Array<boolean>(value.length + 1).fill(false);
      next[0] = token === '*' && previous[0]!;
      for (let index = 1; index <= value.length; index++)
        next[index] =
          token === '*' ? previous[index]! || next[index - 1]! : previous[index - 1]! && token === value[index - 1];
      previous = next;
    }
    return previous[value.length]!;
  }
  function match(g: number, p: number): boolean {
    const key = `${g}:${p}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    if (g === glob.length) result = p === parts.length || (pattern.endsWith('/') && p < parts.length);
    else if (glob[g] === '**') result = match(g + 1, p) || (p < parts.length && match(g, p + 1));
    else result = p < parts.length && segmentMatches(glob[g]!, parts[p]!) && match(g + 1, p + 1);
    memo.set(key, result);
    return result;
  }
  return match(0, 0);
}
export function assertOrdinaryWritesAllowed(rules: Fasfile, paths: readonly string[]): void {
  for (const path of paths) {
    if (!isRepositoryPath(path)) throw new Error(`Invalid write path: ${path}`);
    if (rules.protected_paths?.some((pattern) => matchesRepositoryGlob(pattern, path)))
      throw new Error(`Protected path cannot be written by ordinary work: ${path}`);
  }
}
export function projectReviewRequirements(
  rules: Fasfile,
  paths: readonly string[],
  domains: readonly string[],
  layer: 'requirements' | 'design',
) {
  paths.forEach((path) => {
    if (!isRepositoryPath(path)) throw new Error(`Invalid review path: ${path}`);
  });
  const matched = rules.review_rules.filter(
    (rule) =>
      rule.domains.some((domain) => domains.includes(domain)) ||
      rule.paths.some((pattern) => paths.some((path) => matchesRepositoryGlob(pattern, path))),
  );
  return {
    checks: [...new Set(matched.flatMap((rule) => rule.checks))],
    priorConfirmations: rules.prior_confirmations.filter(
      (rule) => rule.layers.includes(layer) && rule.domains.some((domain) => domains.includes(domain)),
    ),
    highRisk: paths.some((path) => rules.high_risk_paths?.some((pattern) => matchesRepositoryGlob(pattern, path))),
  };
}
