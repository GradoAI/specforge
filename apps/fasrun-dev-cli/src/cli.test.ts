// fasrun command line, run as a process with stdin that is not a terminal (SF-1 T008, D-10).
// TC-PLATFORM-045 — R-platform-015.S1: fasrun --help and fas --help list the same commands.
// TC-PLATFORM-060 — R-platform-015.S2: init creates the repository config and keeps existing files.
// TC-PLATFORM-062 — R-platform-015.S4: init always references AGENTS.md from CLAUDE.md, adding only that line.
// TC-PLATFORM-063 — R-platform-015.S5: login with device authorization; the token is stored 0600 and not printed.
// TC-PLATFORM-064 — R-platform-015.S6: --json prints one JSON object; exit codes 0, 2 and 3.
// TC-PLATFORM-065 — R-platform-015.S7: commands never wait for input and exit at once when input is missing.
// TC-PLATFORM-066 — R-platform-015.S8: init lists created and modified files, also in --json.
// TC-PLATFORM-013 — R-platform-004.S4: the portal serves its page and /readyz; fasrun --version exits 0.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Each test starts several CLI processes; CI runs many suites in parallel, so allow more than the default 5 s.
vi.setConfig({ testTimeout: 30_000 });

const BIN = fileURLToPath(new URL('../bin/run.js', import.meta.url));
const PORTAL = fileURLToPath(new URL('../../fasrun-portal-web/dist/server/index.mjs', import.meta.url));

const dirs: string[] = [];
const temp = (prefix = 'fasrun-cli-') => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** The environment of the test process without FASRUN_* variables, so nothing leaks in from the machine. */
const cleanEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('FASRUN_')) env[key] = value;
  return env;
};

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the CLI with an empty, non-terminal stdin; fails the test if it waits longer than `timeout`. */
function cli(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; bin?: string; timeout?: number } = {}) {
  return new Promise<Run>((resolve, reject) => {
    const child = spawn(process.execPath, [options.bin ?? BIN, ...args], {
      cwd: options.cwd ?? temp(),
      env: { ...cleanEnv(), FASRUN_CONFIG: join(temp(), 'config'), ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.stdin.end();
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`fasrun ${args.join(' ')} did not finish within ${options.timeout ?? 15_000} ms`));
    }, options.timeout ?? 15_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8');

describe('fasrun command line (R-platform-015)', () => {
  it('TC-PLATFORM-045 fasrun --help and fas --help print the same list with every command', async () => {
    const binDir = temp();
    const fas = join(binDir, 'fas');
    symlinkSync(BIN, fas);
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      bin: Record<string, string>;
    };
    expect(manifest.bin).toEqual({ fasrun: './bin/run.js', fas: './bin/run.js' });
    const [fasrun, alias] = await Promise.all([cli(['--help']), cli(['--help'], { bin: fas })]);
    expect(fasrun.code).toBe(0);
    expect(alias.stdout).toBe(fasrun.stdout);
    for (const command of ['spec validate', 'spec archive', 'migrate', 'seed', 'plugin new', 'init', 'check']) {
      expect(fasrun.stdout, command).toContain(command);
    }
  });

  it('TC-PLATFORM-060 init creates fasrun.yaml, the Fasfile and the spec directories, and keeps an existing Fasfile', async () => {
    const empty = temp();
    expect((await cli(['init', empty])).code).toBe(0);
    expect(read(empty, 'fasrun.yaml')).toContain('spec_root: fasrun/');
    expect(read(empty, 'Fasfile')).toContain('version: 1');
    expect(statSync(join(empty, 'fasrun/specs')).isDirectory()).toBe(true);
    expect(statSync(join(empty, 'fasrun/changes')).isDirectory()).toBe(true);

    const existing = temp();
    writeFileSync(join(existing, 'Fasfile'), 'version: 1\n# ours\n');
    expect((await cli(['init'], { cwd: existing })).code).toBe(0);
    expect(read(existing, 'Fasfile')).toBe('version: 1\n# ours\n');
    expect(read(existing, 'fasrun.yaml')).toContain('version: 1');
  });

  it('TC-PLATFORM-062 init always references AGENTS.md from CLAUDE.md and adds only that one line', async () => {
    const empty = temp();
    expect((await cli(['init', empty])).code).toBe(0);
    expect(read(empty, 'AGENTS.md')).toContain('coding agents');
    expect(read(empty, 'CLAUDE.md')).toBe('@AGENTS.md\n');

    const unreferenced = temp();
    writeFileSync(join(unreferenced, 'AGENTS.md'), 'Our agent rules.\n');
    writeFileSync(join(unreferenced, 'CLAUDE.md'), '# Claude\n\nKeep it short.\n');
    expect((await cli(['init', unreferenced])).code).toBe(0);
    expect(read(unreferenced, 'AGENTS.md')).toBe('Our agent rules.\n');
    expect(read(unreferenced, 'CLAUDE.md')).toBe('# Claude\n\nKeep it short.\n@AGENTS.md\n');

    const referenced = temp();
    writeFileSync(join(referenced, 'AGENTS.md'), 'Our agent rules.\n');
    writeFileSync(join(referenced, 'CLAUDE.md'), '@AGENTS.md\n\nMore notes.\n');
    expect((await cli(['init', referenced])).code).toBe(0);
    expect(read(referenced, 'AGENTS.md')).toBe('Our agent rules.\n');
    expect(read(referenced, 'CLAUDE.md')).toBe('@AGENTS.md\n\nMore notes.\n');
  });

  it('TC-PLATFORM-066 init lists the created and modified files, and --json lists them too', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'Fasfile'), 'version: 1\n');
    writeFileSync(join(dir, 'AGENTS.md'), 'Rules.\n');
    writeFileSync(join(dir, 'CLAUDE.md'), '# Claude\n');
    const first = await cli(['init', dir]);
    expect(first.code).toBe(0);
    expect(first.stderr).toContain('Created: fasrun.yaml, fasrun/specs/, fasrun/changes/');
    expect(first.stderr).toContain('Modified: CLAUDE.md');
    expect(first.stderr).not.toMatch(/Created:.*(Fasfile|AGENTS\.md)/);

    const second = await cli(['init', dir, '--json']);
    expect(second.code).toBe(0);
    expect(JSON.parse(second.stdout)).toEqual({
      ok: true,
      command: 'init',
      result: {
        created: [],
        modified: [],
        unchanged: ['fasrun.yaml', 'Fasfile', 'fasrun/specs/', 'fasrun/changes/', 'AGENTS.md', 'CLAUDE.md'],
      },
    });
  });
});

const TOKEN = 'tok_test_access_value';

/** A device-authorization server; `decision` decides what the token endpoint answers after one pending poll. */
async function authServer(decision: 'approve' | 'deny') {
  const seen: Record<string, string>[] = [];
  let polls = 0;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const reply = (status: number, value: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
      };
      if (request.url === '/.well-known/oauth-authorization-server') {
        return reply(200, { device_authorization_endpoint: `${base}/device`, token_endpoint: `${base}/token` });
      }
      seen.push(Object.fromEntries(new URLSearchParams(body)));
      if (request.url === '/device') {
        return reply(200, {
          device_code: 'device-1',
          user_code: 'WDJB-MJHT',
          verification_uri: `${base}/activate`,
          verification_uri_complete: `${base}/activate?user_code=WDJB-MJHT`,
          expires_in: 30,
          interval: 0,
        });
      }
      polls += 1;
      if (polls === 1) return reply(400, { error: 'authorization_pending' });
      if (decision === 'deny') return reply(400, { error: 'access_denied' });
      return reply(200, { access_token: TOKEN, token_type: 'Bearer', expires_in: 300 });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { endpoint, seen, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

describe('fasrun login (R-platform-015)', () => {
  it('TC-PLATFORM-063 approved: prints the address and code, stores the token 0600, never prints it; denied: exit 3', async () => {
    const config = join(temp(), 'config');
    const approve = await authServer('approve');
    try {
      const run = await cli(['login'], { env: { FASRUN_ENDPOINT: approve.endpoint, FASRUN_CONFIG: config } });
      expect(run.code).toBe(0);
      expect(run.stderr).toContain('/activate?user_code=WDJB-MJHT');
      expect(run.stderr).toContain('WDJB-MJHT');
      expect(run.stdout + run.stderr).not.toContain(TOKEN);
      const file = join(config, 'credentials.json');
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ access_token: TOKEN, endpoint: approve.endpoint });
      expect(approve.seen[0]).toMatchObject({ client_id: 'fasrun-cli' });
      expect(approve.seen[1]).toMatchObject({
        client_id: 'fasrun-cli',
        device_code: 'device-1',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
    } finally {
      await approve.close();
    }

    const deny = await authServer('deny');
    try {
      const run = await cli(['login', '--json'], { env: { FASRUN_ENDPOINT: deny.endpoint } });
      expect(run.code).toBe(3);
      expect(JSON.parse(run.stdout)).toMatchObject({ ok: false, error: { code: 'FASRUN_AUTH_DENIED' } });
    } finally {
      await deny.close();
    }
  }, 30_000);
});

describe('agent interface rules (R-platform-015)', () => {
  it('TC-PLATFORM-064 --json prints exactly one JSON object; exit codes 0, 2 and 3', async () => {
    const version = await cli(['--version', '--json']);
    const invalid = await cli(['init', '--no-such-option', '--json']);
    const unconfigured = await cli(['login', '--json']);
    expect([version.code, invalid.code, unconfigured.code]).toEqual([0, 2, 3]);
    for (const run of [version, invalid, unconfigured]) expect(() => JSON.parse(run.stdout) as unknown).not.toThrow();
    expect(JSON.parse(version.stdout)).toMatchObject({ ok: true, command: 'version', result: { version: '0.0.0' } });
    expect(JSON.parse(invalid.stdout)).toMatchObject({ ok: false, command: 'init', error: { code: 'FASRUN_USAGE' } });
    expect(JSON.parse(unconfigured.stdout)).toMatchObject({
      ok: false,
      command: 'login',
      error: { code: 'FASRUN_CONFIG_INVALID', message: expect.stringContaining('FASRUN_ENDPOINT') as string },
    });
  });

  it('TC-PLATFORM-065 with stdin not a terminal, missing input ends the command at once with 2 or 3', async () => {
    const started = Date.now();
    const pluginNew = await cli(['plugin', 'new'], { timeout: 10_000 });
    const login = await cli(['login'], { timeout: 10_000 });
    expect(pluginNew.code).toBe(2);
    expect(pluginNew.stderr).toContain('name');
    expect(login.code).toBe(3);
    expect(login.stderr).toContain('FASRUN_ENDPOINT');
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('exits with 5 and names the task for commands delivered later', async () => {
    const run = await cli(['seed', '--json']);
    expect(run.code).toBe(5);
    expect(JSON.parse(run.stdout)).toMatchObject({
      error: { code: 'FASRUN_NOT_IMPLEMENTED', message: expect.stringContaining('T017') as string },
    });
  });
});

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe('front-end host and command line start (R-platform-004)', () => {
  it('TC-PLATFORM-013 fasrun-portal-web serves its page and /readyz; fasrun --version prints the version and exits 0', async () => {
    const port = await freePort();
    const portal = spawn(process.execPath, [PORTAL], {
      env: { ...cleanEnv(), FASRUN_PORTAL_PORT: String(port) },
      stdio: 'ignore',
    });
    try {
      const base = `http://127.0.0.1:${port}`;
      let ready: Response | undefined;
      for (let attempt = 0; attempt < 50 && ready?.status !== 200; attempt++) {
        ready = await fetch(`${base}/readyz`).catch(() => undefined);
        if (ready?.status !== 200) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(ready?.status).toBe(200);
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('Fasrun 帆驭');
    } finally {
      portal.kill();
    }
    const version = await cli(['--version']);
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/^fasrun \d+\.\d+\.\d+\n$/);
  }, 30_000);
});
