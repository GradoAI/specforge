import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
const source = fileURLToPath(new URL('../../../../../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fasrun-lifecycle-'));
const cliName = '@fasrun/fasrun-dev-cli';
const migrationName = '@fasrun/migration-check';
const helper = 'tools/scripts/src/fixtures/cli-build-lifecycle';
const control = path.join(root, '.lifecycle');
const active = new Set();
const totalTimer = globalThis.setTimeout(() => {
  for (const child of active) killGroup(child.pid);
  fs.rmSync(root, { recursive: true, force: true });
  console.error('lifecycle total deadline exceeded (220s)');
  process.exit(124);
}, 220000);
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TURBO_')));
environment.TURBO_TELEMETRY_DISABLED = '1';
const hostShims = new Map();
function killGroup(pid) {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* already exited */
  }
}
process.once('SIGTERM', () => {
  for (const child of active) killGroup(child.pid);
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(143);
});
async function run(cmd, args, cwd = root) {
  if (cmd === 'pnpm' && args.includes('turbo') && !args.includes('--force') && !args.includes('--cache=local:rw'))
    args = [...args, '--cache=local:rw'];
  const start = Date.now();
  let stdout = '';
  let stderr = '';
  const child = spawn(cmd, args, { cwd, detached: true, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  active.add(child);
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const timer = globalThis.setTimeout(() => killGroup(child.pid), 60000);
  try {
    const status = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    assert.equal(status, 0, stdout + stderr);
    console.log(`${cmd} ${args.join(' ')}: ${Date.now() - start}ms`);
    return stdout;
  } finally {
    clearTimeout(timer);
    killGroup(child.pid);
    active.delete(child);
  }
}
function json(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}
function write(file, value) {
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2));
}
function events() {
  return fs.existsSync(`${control}/events`) ? fs.readFileSync(`${control}/events`, 'utf8').trim().split('\n') : [];
}
function reset() {
  fs.rmSync(control, { recursive: true, force: true });
  fs.mkdirSync(control);
}
function ordered() {
  const log = events();
  assert.equal(log.filter((e) => e === 'build:start').length, 1, log.join(','));
  for (const role of ['cli', 'migration']) {
    assert.ok(log.indexOf(`${role}:start`) > log.indexOf('build:done'), log.join(','));
    assert.ok(log.includes(`${role}:done`), log.join(','));
  }
}
const filters = [`--filter=${cliName}`, `--filter=${migrationName}`];
function turbo(extra = []) {
  return [
    'exec',
    'turbo',
    'run',
    'test',
    ...filters,
    ...(extra.includes('--force') ? [] : ['--cache=local:rw']),
    ...extra,
  ];
}
async function experiment(extra, observe) {
  const start = Date.now();
  let output = '';
  const child = spawn('pnpm', turbo(extra), {
    cwd: root,
    detached: true,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  active.add(child);
  child.stdout.on('data', (s) => {
    output += s;
  });
  child.stderr.on('data', (s) => {
    output += s;
  });
  const finished = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code));
  });
  const deadline = Date.now() + 45000;
  try {
    while (!fs.existsSync(`${control}/cleaned`)) {
      assert.ok(Date.now() < deadline && child.exitCode === null, output || 'clean barrier timed out');
      await setTimeout(20);
    }
    await observe();
  } finally {
    fs.writeFileSync(`${control}/release`, '');
  }
  const timer = globalThis.setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already exited */
    }
  }, 30000);
  const status = await finished;
  clearTimeout(timer);
  killGroup(child.pid);
  active.delete(child);
  console.log(`barrier ${extra.join(' ')}: status=${status}, ${Date.now() - start}ms; ${events().join(',')}`);
  return { status, output };
}
try {
  // Validate the repository's real DAG before replacing database consumers with probes.
  const dag = JSON.parse(await run('pnpm', [...turbo(['--dry=json'])], source));
  const task = (id) => dag.tasks.find((item) => item.taskId === id);
  assert.equal(dag.tasks.filter((item) => item.taskId === `${cliName}#build`).length, 1);
  assert.ok(task(`${cliName}#test`).dependencies.includes(`${cliName}#build`));
  assert.ok(task(`${migrationName}#test`).dependencies.includes(`${cliName}#build`));
  assert.equal(task(`${cliName}#test`).command, 'vitest run');
  const tracked = (await run('git', ['ls-files', '-z'], source)).split('\0').filter(Boolean);
  for (const file of tracked) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, file), target);
  }
  // Include this fixture during development as well as after git staging.
  fs.cpSync(path.join(source, helper), path.join(root, helper), { recursive: true });
  const packages = tracked
    .filter((file) => file.endsWith('package.json') && !file.includes('/fixtures/') && !file.startsWith('.'))
    .map((file) => ({
      dir: path.dirname(file),
      manifest: JSON.parse(fs.readFileSync(path.join(source, file), 'utf8')),
    }))
    .filter(({ manifest }) => manifest.name);
  const local = new Map(packages.map(({ dir }) => [fs.realpathSync(path.join(source, dir)), path.join(root, dir)]));
  function linkModules(dir) {
    const src = path.join(source, dir, 'node_modules');
    const dest = path.join(root, dir, 'node_modules');
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const link = (entry) => {
      const target = fs.realpathSync(path.join(src, entry));
      fs.symlinkSync(local.get(target) ?? target, path.join(dest, entry), 'dir');
    };
    for (const entry of fs.readdirSync(src)) {
      // pnpm's task state and workspace metadata belong to this isolated run.
      if (entry.startsWith('.') && entry !== '.bin' && entry !== '.pnpm') continue;
      if (entry === '.bin') {
        for (const shim of fs.readdirSync(path.join(src, entry))) {
          const file = path.join(src, entry, shim);
          if (fs.statSync(file).isFile()) hostShims.set(file, fs.readFileSync(file, 'utf8'));
        }
        fs.cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true, dereference: true });
      } else if (entry.startsWith('@')) {
        fs.mkdirSync(path.join(dest, entry), { recursive: true });
        for (const name of fs.readdirSync(path.join(src, entry))) link(`${entry}/${name}`);
      } else {
        link(entry);
      }
    }
  }
  for (const { dir } of packages) linkModules(dir);
  reset();
  fs.writeFileSync(
    path.join(root, 'apps/fasrun-dev-cli/tsdown.config.mjs'),
    `export { default } from '../../${helper}/clean-hook.mjs';\n`,
  );
  const cli = json('apps/fasrun-dev-cli/package.json');
  const migration = json('tools/migration-check/package.json');
  const config = json('turbo.json');
  config.tasks.test.cache = false;
  config.tasks[`${cliName}#test`].cache = false;
  write('turbo.json', config);
  assert.equal(cli.scripts.build, 'tsdown src/index.ts src/help.ts --format esm --platform node');
  cli.scripts.build = `node ../../${helper}/task.mjs build`;
  cli.scripts.test = `node ../../${helper}/task.mjs cli`;
  migration.scripts.test = `node ../../${helper}/task.mjs migration`;
  // The runtime probes do not run portal tests or migration-check's database suite.
  // Keep the real CLI runtime dependency closure; its complete production DAG was
  // checked above. This removes test-only upstream work in this disposable copy.
  for (const [name, version] of Object.entries(cli.devDependencies)) {
    if (version.startsWith('workspace:')) delete cli.devDependencies[name];
  }
  migration.devDependencies = { [cliName]: 'workspace:*' };
  write('apps/fasrun-dev-cli/package.json', cli);
  write('tools/migration-check/package.json', migration);
  // Unrelated task proves continuation does not globally serialize/block the graph.
  fs.mkdirSync(path.join(root, 'apps/lifecycle-independent'));
  write('apps/lifecycle-independent/package.json', {
    name: '@fixture/independent',
    private: true,
    scripts: { test: `node ../../${helper}/task.mjs independent` },
  });
  await run('git', ['init', '-q']);
  await run('git', ['add', '.']);
  const probeDag = JSON.parse(await run('pnpm', turbo(['--dry=json'])));
  assert.ok(!probeDag.tasks.some((item) => item.taskId.startsWith('@fasrun/fasrun-portal-web#')));
  for (const [name, version] of Object.entries(cli.dependencies)) {
    if (version.startsWith('workspace:')) assert.ok(probeDag.tasks.some((item) => item.taskId === `${name}#build`));
  }
  const fixedConfig = structuredClone(config);
  const fixedCli = structuredClone(cli);
  // Cold: no outputs yet. Force cases retain real runtime-upstream build scripts.
  await run('pnpm', turbo());
  ordered();
  reset();
  fs.writeFileSync(`${control}/pause`, '');
  const forced = await experiment(['--force'], async () => {
    await setTimeout(150);
    assert.ok(!events().some((e) => e === 'cli:start' || e === 'migration:start'), events().join(','));
  });
  assert.equal(forced.status, 0, forced.output);
  ordered();
  reset();
  fs.rmSync(path.join(root, 'apps/fasrun-dev-cli/dist'), { recursive: true });
  const cached = await run('pnpm', turbo(['--summarize']));
  const summaries = fs.readdirSync(path.join(root, '.turbo/runs'));
  const summary = json(`.turbo/runs/${summaries.at(-1)}`);
  assert.equal(summary.tasks.find((item) => item.taskId === `${cliName}#build`).cache.status, 'HIT', cached);
  assert.ok(fs.existsSync(path.join(root, 'apps/fasrun-dev-cli/dist/index.mjs')));
  await run(process.execPath, ['apps/fasrun-dev-cli/bin/run.js', '--version']);
  assert.ok(!events().includes('build:start'), events().join(','));
  assert.ok(events().includes('cli:done') && events().includes('migration:done'), events().join(','));
  console.log('cache: CLI build HIT and restored real entry consumed');
  // Supported package entry from absent CLI output, then explicit build + direct test.
  reset();
  fs.rmSync(path.join(root, 'apps/fasrun-dev-cli/dist'), { recursive: true });
  await run('pnpm', ['exec', 'turbo', 'run', 'test', `--filter=${cliName}`, '--force']);
  assert.ok(events().indexOf('cli:start') > events().indexOf('build:done'));
  await run('pnpm', ['exec', 'turbo', 'run', 'build', `--filter=${cliName}`]);
  await run('pnpm', ['--filter', cliName, 'test']);
  for (const mode of [[], ['--continue=dependencies-successful', '--filter=@fixture/independent']]) {
    reset();
    fs.writeFileSync(`${control}/pause`, '');
    fs.writeFileSync(`${control}/fail`, '');
    const failed = await experiment(['--force', ...mode], async () => {
      assert.ok(!events().includes('cli:start') && !events().includes('migration:start'));
    });
    assert.equal(failed.status, 1, failed.output);
    assert.match(failed.output, /injected producer failure after real clean/);
    assert.ok(!events().includes('cli:start') && !events().includes('migration:start'), events().join(','));
    if (mode.length) assert.ok(events().includes('independent:done'), failed.output);
    // Seed a real previous artifact for the next failure/legacy scenario.
    reset();
    await run('pnpm', ['exec', 'turbo', 'run', 'build', `--filter=${cliName}`, '--force']);
  }
  // Original two-producer test plus missing self edge: the sibling consumes during clean.
  reset();
  fs.writeFileSync(`${control}/legacy`, '');
  delete config.tasks[`${cliName}#test`];
  write('turbo.json', config);
  cli.scripts.build = `node ../../${helper}/task.mjs baseline`;
  cli.scripts.test = `node ../../${helper}/task.mjs build && node ../../${helper}/task.mjs cli`;
  write('apps/fasrun-dev-cli/package.json', cli);
  // Pause only the test's second producer: the ordinary upstream build has no hook.
  fs.writeFileSync(`${control}/pause`, '');
  const legacy = await experiment(['--force', '--continue=dependencies-successful'], async () => {
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(`${control}/migration-finished`)) {
      assert.ok(Date.now() < deadline);
      await setTimeout(20);
    }
    const consumed = json('.lifecycle/migration-finished');
    assert.equal(consumed.status, 1);
    assert.match(consumed.stderr, /ERR_MODULE_NOT_FOUND/);
  });
  assert.equal(legacy.status, 1, legacy.output);
  assert.match(legacy.output, /ERR_MODULE_NOT_FOUND/);
  console.log('legacy: reproduced ERR_MODULE_NOT_FOUND during real tsdown clean');
  write('turbo.json', fixedConfig);
  write('apps/fasrun-dev-cli/package.json', fixedCli);
  reset();
  await run('pnpm', turbo(['--force']));
  ordered();
  console.log('lifecycle: all scenarios passed');
} finally {
  clearTimeout(totalTimer);
  for (const child of active) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* exited */
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
  for (const [file, before] of hostShims)
    assert.equal(fs.readFileSync(file, 'utf8'), before, `host shim changed: ${file}`);
}
