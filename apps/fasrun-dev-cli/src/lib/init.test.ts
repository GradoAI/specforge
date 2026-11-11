import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hasAgentsReference, runInit } from './init.js';

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'fasrun-init-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('runInit', () => {
  it('recognises the reference only as a line of its own', () => {
    expect(hasAgentsReference('# Notes\n  @AGENTS.md  \n')).toBe(true);
    expect(hasAgentsReference('See @AGENTS.md for details\n')).toBe(false);
    expect(hasAgentsReference('@AGENTS.md.bak\n')).toBe(false);
  });

  it('adds a newline before the reference when CLAUDE.md does not end with one', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'CLAUDE.md'), '# Rules\nBe careful.');
    expect((await runInit(dir)).modified).toEqual(['CLAUDE.md']);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# Rules\nBe careful.\n@AGENTS.md\n');
  });

  it('appends to an empty CLAUDE.md without a leading blank line', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'CLAUDE.md'), '');
    await runInit(dir);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
  });
});
