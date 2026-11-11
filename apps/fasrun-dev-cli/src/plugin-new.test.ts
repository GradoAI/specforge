// fasrun plugin new (SF-1 T010, D-6), run as a process against a minimal workspace.
// TC-PLATFORM-018 — R-platform-006.S1: a backend plugin is generated with four layers and migrations/ and registered.
// TC-PLATFORM-019 — R-platform-006.S2: an invalid role writes nothing and lists the valid roles.
// TC-PLATFORM-020 — R-platform-006.S3: an existing package is not overwritten.
// The nine capability plugins committed under plugins/ must equal what the command generates (golden check).
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRole, renderPackage } from '@fasrun/cli-templates';
import * as prettier from 'prettier';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Each test starts several CLI processes; CI runs many suites in parallel, so allow more than the default 5 s.
vi.setConfig({ testTimeout: 30_000 });

const BIN = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A workspace with the two hosts' plugin lists, package.json and tsconfig, copied from this repository. */
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'fasrun-plugin-new-'));
  dirs.push(root);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - plugins/*/*\n');
  writeFileSync(join(root, 'tsconfig.json'), '{\n  "files": [],\n  "references": []\n}\n');
  for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
    mkdirSync(join(root, 'apps', host, 'src'), { recursive: true });
    cpSync(join(REPO, 'apps', host, 'package.json'), join(root, 'apps', host, 'package.json'));
    cpSync(join(REPO, 'apps', host, 'tsconfig.json'), join(root, 'apps', host, 'tsconfig.json'));
    // fasrun-node-svc registers no plugins yet, so its list shows the empty marker blocks.
    cpSync(join(REPO, 'apps/fasrun-node-svc/src/plugins.ts'), join(root, 'apps', host, 'src', 'plugins.ts'));
  }
  return root;
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });

function cli(args: string[], cwd: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const snapshot = (root: string) =>
  execFileSync('find', ['.', '-type', 'f'], { cwd: root, encoding: 'utf8' }).split('\n').sort();

describe('fasrun plugin new (R-platform-006)', () => {
  it('TC-PLATFORM-018 generates a backend plugin with four layers and migrations/ and registers it in fasrun-core-svc', async () => {
    const root = workspace();
    const run = await cli(['plugin', 'new', 'demo', '--role', 'backend', '--json'], root);
    expect(run.code).toBe(0);
    const pkg = join(root, 'plugins/demo/demo-backend');
    for (const dir of ['src/starter', 'src/application', 'src/infrastructure', 'src/common', 'migrations']) {
      expect(existsSync(join(pkg, dir)), dir).toBe(true);
    }
    const hostList = readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    // The fixture has no Prettier configuration, so quotes follow Prettier's defaults.
    expect(hostList).toMatch(/import demoPlugin from ["']@fasrun\/plugin-demo-backend["'];/);
    expect(hostList).toMatch(/fasrun:plugin-list:begin\s+demoPlugin,\s+\/\/ fasrun:plugin-list:end/);
    const hostManifest = JSON.parse(readFileSync(join(root, 'apps/fasrun-core-svc/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(hostManifest.dependencies['@fasrun/plugin-demo-backend']).toBe('workspace:*');
    expect(readFileSync(join(root, 'apps/fasrun-core-svc/tsconfig.json'), 'utf8')).toContain(
      '../../plugins/demo/demo-backend',
    );
    expect(readFileSync(join(root, 'tsconfig.json'), 'utf8')).toContain('plugins/demo/demo-backend');
    expect(readFileSync(join(root, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8')).not.toContain('demo');
    expect(JSON.parse(run.stdout)).toMatchObject({
      ok: true,
      result: { package: '@fasrun/plugin-demo-backend', nextSteps: ['pnpm install'] },
    });
  }, 30_000);

  it('TC-PLATFORM-019 an invalid role exits with 2, lists the valid roles and writes nothing', async () => {
    const root = workspace();
    const before = snapshot(root);
    const run = await cli(['plugin', 'new', 'demo', '--role', 'server'], root);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('common, node, react, backend, backend-module-<name>, web, web-module-<name>');
    expect(snapshot(root)).toEqual(before);
  });

  it('TC-PLATFORM-020 an existing package is refused and left unchanged', async () => {
    const root = workspace();
    expect((await cli(['plugin', 'new', 'demo', '--role', 'backend'], root)).code).toBe(0);
    const marker = join(root, 'plugins/demo/demo-backend/src/index.ts');
    writeFileSync(marker, '// edited by hand\n');
    const hostList = readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    const again = await cli(['plugin', 'new', 'demo', '--role', 'backend'], root);
    expect(again.code).toBe(2);
    expect(again.stderr).toContain('already exists');
    expect(readFileSync(marker, 'utf8')).toBe('// edited by hand\n');
    expect(readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8')).toBe(hostList);
  }, 30_000);

  it('registers connect in fasrun-connect-svc, honours --host, and keeps non-backend roles out of the hosts', async () => {
    const root = workspace();
    expect((await cli(['plugin', 'new', 'connect', '--role', 'backend'], root)).code).toBe(0);
    expect(readFileSync(join(root, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8')).toContain('connectPlugin,');
    expect((await cli(['plugin', 'new', 'relay', '--role', 'backend', '--host', 'connect'], root)).code).toBe(0);
    expect(readFileSync(join(root, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8')).toContain('relayPlugin,');
    const core = readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    expect((await cli(['plugin', 'new', 'relay', '--role', 'common'], root)).code).toBe(0);
    expect(readFileSync(join(root, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8')).toBe(core);
    expect((await cli(['plugin', 'new', 'Bad_Name', '--role', 'common'], root)).code).toBe(2);
  }, 30_000);
});

const CAPABILITIES = [
  'entry',
  'identity',
  'spec',
  'knowledge',
  'orchestration',
  'environment',
  'governance',
  'insight',
  'connect',
];

describe('the nine capability plugins (R-platform-006)', () => {
  it('equal the output of fasrun plugin new and are registered in their hosts', async () => {
    const tracked = git('ls-files', 'plugins').split('\n').filter(Boolean).sort();
    const expected: string[] = [];
    for (const plugin of CAPABILITIES) {
      for (const roleName of ['common', 'backend']) {
        const role = parseRole(roleName);
        if (!role) throw new Error(roleName);
        for (const file of renderPackage(plugin, role)) {
          const path = `plugins/${plugin}/${plugin}-${roleName}/${file.path}`;
          expected.push(path);
          const absolute = join(REPO, path);
          const info = await prettier.getFileInfo(absolute);
          const content = info.inferredParser
            ? await prettier.format(file.content, {
                ...((await prettier.resolveConfig(absolute)) ?? {}),
                filepath: absolute,
              })
            : file.content;
          expect(readFileSync(absolute, 'utf8'), path).toBe(content);
        }
      }
    }
    expect(tracked).toEqual(expected.sort());
    const core = readFileSync(join(REPO, 'apps/fasrun-core-svc/src/plugins.ts'), 'utf8');
    const connect = readFileSync(join(REPO, 'apps/fasrun-connect-svc/src/plugins.ts'), 'utf8');
    for (const plugin of CAPABILITIES.filter((p) => p !== 'connect'))
      expect(core, plugin).toContain(`${plugin}Plugin,`);
    expect(connect).toContain('connectPlugin,');
    expect(core).not.toContain('connectPlugin');
  });
});
