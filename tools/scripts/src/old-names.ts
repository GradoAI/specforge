// Residue check for old names (R-platform-018). The names and the exceptions live only in
// tools/scripts/old-names.yaml, so no other file has to quote them.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface OldNamesConfig {
  names: { pattern: string; ignore_case?: boolean; description: string }[];
  exceptions: { files: string[]; directories: string[]; text: string[] };
}

export const OLD_NAMES_CONFIG = 'tools/scripts/old-names.yaml';

export function loadOldNames(path: string): OldNamesConfig {
  return parse(readFileSync(path, 'utf8')) as OldNamesConfig;
}

/** `*` in a directory exception matches one path segment, e.g. the archive date. */
function directoryMatcher(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}`);
}

export function isExceptedFile(config: OldNamesConfig, path: string): boolean {
  return (
    config.exceptions.files.includes(path) ||
    config.exceptions.directories.some((dir) => directoryMatcher(dir).test(path))
  );
}

/** Returns `path:line` for every line that still contains an old name; excepted text is removed first. */
export function findOldNames(
  config: OldNamesConfig,
  files: readonly string[],
  read: (path: string) => string,
): string[] {
  const patterns = config.names.map(({ pattern, ignore_case }) => new RegExp(pattern, ignore_case ? 'i' : ''));
  const hits: string[] = [];
  for (const path of files) {
    if (isExceptedFile(config, path)) continue;
    read(path)
      .split('\n')
      .forEach((line, index) => {
        const checked = config.exceptions.text.reduce((text, allowed) => text.replaceAll(allowed, ''), line);
        if (patterns.some((re) => re.test(checked))) hits.push(`${path}:${index + 1}`);
      });
  }
  return hits;
}
