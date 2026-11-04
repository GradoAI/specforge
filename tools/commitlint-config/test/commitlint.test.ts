// TC-PLATFORM-006 — R-platform-002.S4: a commit message that is not a Conventional Commit is rejected.
import { resolve } from 'node:path';
import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { describe, expect, it } from 'vitest';

const config = await load({ extends: [resolve(import.meta.dirname, '../index.js')] });
const check = (message: string) =>
  lint(message, config.rules, config.parserPreset ? { parserOpts: config.parserPreset.parserOpts as object } : {});

describe('commitlint config', () => {
  it('TC-PLATFORM-006 rejects "update stuff"', async () => {
    const result = await check('update stuff');
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.name)).toEqual(expect.arrayContaining(['type-empty', 'subject-empty']));
  });

  it('accepts a conventional message and rejects unknown types', async () => {
    expect((await check('feat(spec): add sf spec validate')).valid).toBe(true);
    expect((await check('feature: add something')).valid).toBe(false);
  });
});
