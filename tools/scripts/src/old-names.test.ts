// Residue check mechanics (SF-3 T001, R-platform-018). A made-up old name keeps this file free of real ones.
import { describe, expect, it } from 'vitest';
import { findOldNames, isExceptedFile, type OldNamesConfig } from './old-names.js';

const config: OldNamesConfig = {
  names: [
    { pattern: 'oldbrand', ignore_case: true, description: 'old product name' },
    { pattern: '\\bOB_', description: 'old variable prefix' },
  ],
  exceptions: {
    files: ['tools/scripts/old-names.yaml'],
    directories: ['fasrun/changes/archive/*-SF-9-rename/'],
    text: ['legacy/oldbrand-archive'],
  },
};

const files: Record<string, string> = {
  'README.md': 'Fasrun\n',
  'docs/a.md': 'first line\nformerly OldBrand\n',
  'apps/x/.env.example': 'OB_PORT=1\n',
  'tools/scripts/old-names.yaml': 'oldbrand\n',
  'fasrun/changes/archive/2026-11-11-SF-9-rename/requirements.md': 'oldbrand\n',
  'fasrun/changes/SF-9-rename/requirements.md': 'oldbrand\n',
  'docs/history.md': 'see legacy/oldbrand-archive\nand legacy/oldbrand-archive next to oldbrand\n',
};
const read = (path: string) => files[path] ?? '';

describe('old-name residue check', () => {
  it('reports every file and line that contains a listed name, ignoring case only where configured', () => {
    expect(findOldNames(config, Object.keys(files), read)).toEqual([
      'docs/a.md:2',
      'apps/x/.env.example:1',
      'fasrun/changes/SF-9-rename/requirements.md:1',
      'docs/history.md:2',
    ]);
    expect(findOldNames(config, ['a.ts'], () => 'ob_port')).toEqual([]);
  });

  it('skips the configuration file and the excepted directories, and only the excepted text on a line', () => {
    expect(isExceptedFile(config, 'tools/scripts/old-names.yaml')).toBe(true);
    expect(isExceptedFile(config, 'fasrun/changes/archive/2026-11-11-SF-9-rename/specs/x/spec.md')).toBe(true);
    expect(isExceptedFile(config, 'fasrun/changes/archive/x/2026-11-11-SF-9-rename/a.md')).toBe(false);
    expect(isExceptedFile(config, 'fasrun/changes/SF-9-rename/requirements.md')).toBe(false);
    expect(findOldNames(config, ['docs/history.md'], read)).toEqual(['docs/history.md:2']);
  });
});
