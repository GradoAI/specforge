// fasrun plugin new (SF-1 T010, D-6), run as a process against a minimal workspace.
// TC-PLATFORM-018 — R-platform-006.S1: a backend plugin is generated with four layers and migrations/ and registered.
// TC-PLATFORM-019 — R-platform-006.S2: an invalid role writes nothing and lists the valid roles.
// TC-PLATFORM-020 — R-platform-006.S3: an existing package is not overwritten.
// TC-PLATFORM-067 — R-platform-006.S4: CLI output matches fixed fixtures; real plugins can evolve.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Each test starts several CLI processes; CI runs many suites in parallel, so allow more than the default 5 s.
vi.setConfig({ testTimeout: 30_000 });

const BIN = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const FIXTURES = fileURLToPath(new URL('../test/fixtures/plugin-new/', import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Record<string, string>;

/** Fixed host markers and formatting configuration, independent of production hosts and plugin contents. */
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'fasrun-plugin-new-'));
  dirs.push(root);
  for (const [path, content] of Object.entries(fixture('workspace.json'))) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function contents(root: string, relative = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(result, contents(root, path));
    else result[path] = readFileSync(join(root, path), 'utf8');
  }
  return result;
}

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
    // Quote style is not part of the registration contract.
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

function assertRegistrations(root: string) {
  for (const host of ['core', 'connect']) {
    const dir = join(root, `apps/fasrun-${host}-svc`);
    const source = readFileSync(join(dir, 'src/plugins.ts'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const config = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8')) as { references: { path: string }[] };
    for (const plugin of CAPABILITIES) {
      const belongs = (plugin === 'connect') === (host === 'connect');
      const packageName = `@fasrun/plugin-${plugin}-backend`;
      if (belongs) {
        expect(source).toContain(`import ${plugin}Plugin from '${packageName}';`);
        expect(source).toMatch(
          new RegExp(`fasrun:plugin-list:begin[\\s\\S]*\\b${plugin}Plugin,[\\s\\S]*fasrun:plugin-list:end`),
        );
        expect(manifest.dependencies[packageName]).toBe('workspace:*');
        expect(config.references).toContainEqual({ path: `../../plugins/${plugin}/${plugin}-backend` });
      } else {
        expect(source).not.toContain(packageName);
        expect(manifest.dependencies[packageName]).toBeUndefined();
      }
    }
  }
}

describe('scaffolding and real capability plugins (R-platform-006)', () => {
  it('TC-PLATFORM-067 actual CLI output matches the independent versioned fixture and registers all plugins', async () => {
    const root = workspace();
    for (const plugin of CAPABILITIES) {
      for (const role of ['common', 'backend']) {
        const run = await cli(['plugin', 'new', plugin, '--role', role, '--json'], root);
        expect(run.code, run.stderr).toBe(0);
      }
    }
    // Includes the complete file set, including empty .gitkeep files. No renderer supplies expected values.
    expect(contents(join(root, 'plugins'))).toEqual(fixture('expected.json'));
    assertRegistrations(root);
  }, 60_000);

  it('TC-PLATFORM-067 real plugins retain host registrations while their business files evolve', () => {
    assertRegistrations(REPO);
  });
});
