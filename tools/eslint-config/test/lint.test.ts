// Dependency direction through the shared ESLint config (SF-1 T002).
// TC-PLATFORM-003 — R-platform-002.S1: importing another plugin's -backend package is an error with file, line and rule.
// TC-PLATFORM-004 — R-platform-002.S2: a -common package importing a -backend package is an error.
// TC-PLATFORM-005 — R-platform-002.S3: a -backend package importing another plugin's -common package is allowed.
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { createConfig } from '../src/index.js';

const WORKSPACE = resolve(import.meta.dirname, 'fixtures/workspace');
const RULE = 'specforge/dependency-direction';
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: WORKSPACE,
    overrideConfigFile: true,
    overrideConfig: createConfig({ typeChecked: false }),
  });
});

async function lint(file: string) {
  const [result] = await eslint.lintFiles([join(WORKSPACE, file)]);
  if (!result) throw new Error(`no lint result for ${file}`);
  const formatter = await eslint.loadFormatter('stylish');
  const output = await formatter.format([result]);
  return { messages: result.messages.filter((m) => m.ruleId === RULE), all: result.messages, output };
}

describe('dependency direction in the shared config', () => {
  it('TC-PLATFORM-003 a plugin importing another plugin -backend package fails with file, line and rule name', async () => {
    const file = 'plugins/alpha/alpha-backend/src/imports-other-backend.ts';
    const { messages, output } = await lint(file);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ severity: 2, line: 1 });
    expect(messages[0]?.message).toContain('@specforge/plugin-beta-backend');
    expect(output).toContain(file.split('/').pop());
    expect(output).toMatch(/1:\d+\s+error/);
    expect(output).toContain(RULE);
  });

  it('TC-PLATFORM-004 a -common package importing a -backend package fails', async () => {
    const { messages } = await lint('plugins/alpha/alpha-common/src/imports-backend.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });

  it('TC-PLATFORM-005 a -backend package importing another plugin -common package and a backend base package passes', async () => {
    const { messages, all } = await lint('plugins/alpha/alpha-backend/src/imports-allowed.ts');
    expect(messages).toEqual([]);
    expect(all.filter((m) => m.severity === 2)).toEqual([]);
  });

  it('lets hosts import -backend packages for assembly', async () => {
    expect((await lint('apps/sf-core-svc/src/index.ts')).messages).toEqual([]);
  });

  it('rejects deep imports past exports, relative imports into another package, and base packages using plugins', async () => {
    expect((await lint('plugins/alpha/alpha-backend/src/imports-deep.ts')).messages[0]?.message).toContain(
      'does not export',
    );
    expect((await lint('plugins/alpha/alpha-backend/src/imports-relative.ts')).messages[0]?.message).toContain(
      'leaves package',
    );
    expect((await lint('packages/backend-defaults/src/imports-plugin.ts')).messages[0]?.message).toContain(
      'base packages',
    );
  });
});
