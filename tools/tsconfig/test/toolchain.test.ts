// Toolchain checks for the monorepo skeleton (SF-1 T001).
// TC-PLATFORM-001 — R-platform-001.S1: a fresh clone installs, builds and type-checks in strict mode.
// TC-PLATFORM-002 — R-platform-001.S2: dependency install scripts do not run unless allowed.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const PNPM_VERSION = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { packageManager: string })
  .packageManager;
const tempDirs: string[] = [];
// A packed tarball next to the probe project; pnpm identifies it as `<name>@file:<relative path>`.
const FIXTURE_SPEC = 'file:../sf-postinstall-fixture-1.0.0.tgz';

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `sf-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

function run(cwd: string, cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: '1' },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/** The supply-chain settings of the repository, without the workspace package list. */
function repoInstallSettings(): string {
  const yaml = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line.startsWith('minimumReleaseAge:'));
  expect(start, 'pnpm-workspace.yaml declares minimumReleaseAge').toBeGreaterThanOrEqual(0);
  return lines.slice(start).join('\n');
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('monorepo toolchain', () => {
  it('TC-PLATFORM-001 fresh clone installs, builds and type-checks in strict mode', () => {
    const base = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/tsconfig/tsconfig.base.json'), 'utf8')) as {
      compilerOptions: Record<string, unknown>;
    };
    expect(base.compilerOptions).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      composite: true,
      module: 'nodenext',
      moduleResolution: 'nodenext',
    });

    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const clone = join(tempDir('clone'), 'specforge');
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', REPO_ROOT, clone]);
    execFileSync('git', ['checkout', '--quiet', head], { cwd: clone });

    for (const args of [['install', '--frozen-lockfile'], ['build'], ['typecheck']]) {
      const { status, output } = run(clone, 'pnpm', args);
      expect(status, `pnpm ${args.join(' ')} failed:\n${output}`).toBe(0);
    }
  });

  describe('TC-PLATFORM-002 dependency install scripts', () => {
    function setup(extraSettings: string) {
      const root = tempDir('scripts');
      const marker = join(root, 'postinstall-ran');
      const fixture = join(root, 'fixture');
      mkdirSync(fixture);
      writeFileSync(
        join(fixture, 'package.json'),
        JSON.stringify({
          name: 'sf-postinstall-fixture',
          version: '1.0.0',
          scripts: { postinstall: `node -e "require('fs').writeFileSync('${marker}', 'ran')"` },
        }),
      );
      const packed = run(fixture, 'npm', ['pack', '--silent', '--pack-destination', root]);
      expect(packed.status, packed.output).toBe(0);

      const project = join(root, 'project');
      mkdirSync(project);
      writeFileSync(
        join(project, 'package.json'),
        JSON.stringify({
          name: 'sf-postinstall-probe',
          private: true,
          packageManager: PNPM_VERSION,
          dependencies: { 'sf-postinstall-fixture': FIXTURE_SPEC },
        }),
      );
      writeFileSync(join(project, 'pnpm-workspace.yaml'), `${repoInstallSettings()}\n${extraSettings}`);
      return { project, marker };
    }

    it('does not run a postinstall script that is not in allowBuilds', () => {
      const { project, marker } = setup('');
      const { status, output } = run(project, 'pnpm', ['install']);
      expect(existsSync(marker), 'postinstall must not run').toBe(false);
      // strictDepBuilds turns the ignored build into a failed install that names the package.
      expect(status, output).not.toBe(0);
      expect(output).toContain('sf-postinstall-fixture');
    });

    it('runs it only when the package is explicitly allowed (control)', () => {
      const repoSettings = repoInstallSettings().replace(/^allowBuilds:.*$/m, '');
      const { project, marker } = setup('');
      writeFileSync(
        join(project, 'pnpm-workspace.yaml'),
        `${repoSettings}\nallowBuilds:\n  "sf-postinstall-fixture@${FIXTURE_SPEC}": true\n`,
      );
      const { status, output } = run(project, 'pnpm', ['install']);
      expect(status, output).toBe(0);
      expect(existsSync(marker), 'allowed postinstall runs').toBe(true);
    });
  });
});
