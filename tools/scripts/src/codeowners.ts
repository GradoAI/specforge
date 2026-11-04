/**
 * CODEOWNERS evaluation with GitHub's semantics: gitignore-style patterns, last matching rule wins,
 * a rule without owners removes ownership. Negation (`!`) and character ranges are not supported by GitHub
 * and are rejected here.
 */
import { readFileSync } from 'node:fs';

export interface CodeOwnersRule {
  pattern: string;
  owners: string[];
  line: number;
  regex: RegExp;
}

export function parseCodeOwners(text: string): CodeOwnersRule[] {
  const rules: CodeOwnersRule[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern) return;
    if (pattern.startsWith('!') || /[[\]]/.test(pattern)) {
      throw new Error(`CODEOWNERS line ${index + 1}: unsupported pattern "${pattern}"`);
    }
    rules.push({ pattern, owners, line: index + 1, regex: patternToRegExp(pattern) });
  });
  return rules;
}

export function loadCodeOwners(path: string): CodeOwnersRule[] {
  return parseCodeOwners(readFileSync(path, 'utf8'));
}

/** Converts a gitignore-style pattern to a regular expression over repository-relative paths. */
export function patternToRegExp(pattern: string): RegExp {
  let p = pattern;
  const directoryOnly = p.endsWith('/');
  if (directoryOnly) p = p.slice(0, -1);
  // A pattern with a slash anywhere except the end is relative to the repository root.
  const anchored = p.startsWith('/') || p.includes('/');
  if (p.startsWith('/')) p = p.slice(1);

  let body = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i] as string;
    if (c === '*') {
      if (p[i + 1] === '*') {
        const atSegmentStart = i === 0 || p[i - 1] === '/';
        const atSegmentEnd = i + 2 === p.length || p[i + 2] === '/';
        if (atSegmentStart && atSegmentEnd) {
          if (p[i + 2] === '/') {
            body += '(?:.*/)?';
            i += 2;
          } else {
            body += '.*';
            i += 1;
          }
          continue;
        }
      }
      body += '[^/]*';
    } else if (c === '?') {
      body += '[^/]';
    } else {
      body += c.replace(/[.+^${}()|\\]/g, '\\$&');
    }
  }
  const prefix = anchored ? '^' : '^(?:.*/)?';
  // A directory pattern covers everything inside it. A pattern without a trailing slash may also name a
  // directory (`/apps/github`), but a wildcard in the last segment stays at that level (`docs/*`).
  const lastSegment = p.slice(p.lastIndexOf('/') + 1);
  const suffix = directoryOnly ? '/.*$' : lastSegment.includes('*') ? '$' : '(?:/.*)?$';
  return new RegExp(prefix + body + suffix);
}

/** Owners of a repository-relative file path (no leading slash), from the last matching rule. */
export function ownersOf(rules: CodeOwnersRule[], path: string): { owners: string[]; rule?: CodeOwnersRule } {
  let match: CodeOwnersRule | undefined;
  for (const rule of rules) if (rule.regex.test(path)) match = rule;
  return match ? { owners: match.owners, rule: match } : { owners: [] };
}
