import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processScope } from './processes.mjs';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { parse, stringify } from 'yaml';
const source = fileURLToPath(new URL('../../../../../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fasrun-lifecycle-'));
const cliName = '@fasrun/fasrun-dev-cli';
const migrationName = '@fasrun/migration-check';
const helper = 'tools/scripts/src/fixtures/cli-build-lifecycle';
const control = path.join(root, '.lifecycle');
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TURBO_')));
environment.TURBO_TELEMETRY_DISABLED = '1';
const processes = processScope({ env: environment, redact: [root, source, os.homedir()] });
const hostShims = new Map();
let fatalStatus;
let stage = 'setup';
const started = Date.now();
function cancel(status, message) {
  fatalStatus ??= status;
  console.error(`${message}; stage=${stage}, elapsed=${Date.now() - started}ms`);
  processes.cancel(new Error(message));
}
const totalTimer = globalThis.setTimeout(() => cancel(124, 'lifecycle total deadline exceeded (220s)'), 220000);
const onTerminate = () => cancel(143, 'lifecycle received SIGTERM');
process.once('SIGTERM', onTerminate);
async function run(cmd, args, cwd = root) {
  if (cmd === 'pnpm' && args.includes('turbo') && !args.includes('--force') && !args.includes('--cache=local:rw'))
    args = [...args, '--cache=local:rw'];
  stage = `${cmd === process.execPath ? 'node' : cmd} ${args.join(' ')}`;
  const start = Date.now();
  const handle = processes.start(cmd, args, cwd);
  let timedOut = false;
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    handle.stop();
  }, 60000);
  try {
    const result = await handle.done;
    const evidence = handle.evidence(result);
    console.log(`${stage}: ${Date.now() - start}ms; exit=${result.code}, signal=${result.signal ?? 'none'}`);
    if (fatalStatus || timedOut || result.code !== 0 || result.spawnError || result.killError || result.outputLimit)
      console.error(evidence);
    processes.check();
    assert.equal(result.killError, undefined, evidence);
    assert.equal(result.outputLimit, false, evidence);
    assert.equal(timedOut, false, `60s deadline: ${stage}\n${evidence}`);
    assert.equal(result.spawnError, undefined, evidence);
    assert.equal(result.code, 0, evidence);
    return handle.output();
  } finally {
    clearTimeout(timer);
    handle.stop();
    await handle.done;
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
  stage = `barrier ${extra.join(' ')}`;
  const start = Date.now();
  const handle = processes.start('pnpm', turbo(extra), root);
  const deadline = Date.now() + 45000;
  let timer;
  let result;
  let timedOut = false;
  try {
    return await processes.using(handle, async () => {
      while (!fs.existsSync(`${control}/cleaned`)) {
        processes.check();
        assert.ok(
          Date.now() < deadline && handle.child.exitCode === null && handle.child.signalCode === null,
          processes.safe(handle.output()) || 'clean barrier timed out',
        );
        await setTimeout(20);
      }
      await observe();
      processes.check();
      fs.writeFileSync(`${control}/release`, '');
      timer = globalThis.setTimeout(() => {
        timedOut = true;
        handle.stop();
      }, 30000);
      result = await handle.done;
      processes.check();
      assert.equal(timedOut, false, `30s completion deadline: ${handle.evidence(result)}`);
      assert.equal(result.killError, undefined, handle.evidence(result));
      assert.equal(result.outputLimit, false, handle.evidence(result));
      assert.equal(result.spawnError, undefined, handle.evidence(result));
      return { status: result.code, output: handle.evidence(result) };
    });
  } finally {
    clearTimeout(timer);
    // An observation assertion can throw before the normal completion path.
    // Always reap before any caller resets/removes the control directory.
    if (fs.existsSync(control)) fs.writeFileSync(`${control}/release`, '');
    handle.stop();
    result = await handle.done;
    console.log(`${stage}: ${Date.now() - start}ms; ${events().join(',')}; ${handle.evidence(result)}`);
  }
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
  // Dependencies are mapped from a frozen installation below. Probe manifest edits
  // must never trigger pnpm to install into these read-only dependency links.
  const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
  const workspace = parse(fs.readFileSync(workspaceFile, 'utf8'));
  workspace.verifyDepsBeforeRun = false;
  fs.writeFileSync(workspaceFile, stringify(workspace));
  assert.equal((await run('pnpm', ['config', 'get', 'verifyDepsBeforeRun'])).trim(), 'false');
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
  // Produce verified upstream snapshots inside this copy, never from host dist
  // which may be cleaned by another task. Each topological level runs in parallel
  // through real Turbo with the original package build commands. Preparation is
  // bounded independently from the CLI lifecycle; no product task is serialized.
  const byName = new Map(packages.map((item) => [item.manifest.name, item]));
  const levels = new Map();
  const visiting = new Set();
  function runtimeLevel(name) {
    if (levels.has(name)) return levels.get(name);
    assert.ok(!visiting.has(name), `cyclic runtime dependency: ${name}`);
    visiting.add(name);
    const item = byName.get(name);
    assert.ok(item, `missing workspace package: ${name}`);
    const dependencies = Object.entries({ ...item.manifest.dependencies, ...item.manifest.optionalDependencies })
      .filter(([, version]) => version.startsWith('workspace:'))
      .map(([dependency]) => dependency);
    const level = dependencies.length ? 1 + Math.max(...dependencies.map(runtimeLevel)) : 0;
    visiting.delete(name);
    levels.set(name, level);
    return level;
  }
  for (const [name, version] of Object.entries(cli.dependencies)) {
    if (version.startsWith('workspace:')) runtimeLevel(name);
  }
  // Let one real Turbo DAG schedule the complete runtime closure. Separate
  // level invocations re-traverse ^build ancestors and repeatedly hash/cache them.
  const upstreamNames = [...levels.keys()].sort();
  const buildArgs = ['exec', 'turbo', 'run', 'build', ...upstreamNames.map((name) => `--filter=${name}`)];
  const preparationDag = JSON.parse(await run('pnpm', [...buildArgs, '--dry=json']));
  assert.deepEqual(
    preparationDag.tasks.map((item) => item.taskId).sort(),
    upstreamNames.map((name) => `${name}#build`),
  );
  for (const item of preparationDag.tasks) {
    assert.equal(
      item.command,
      byName.get(item.package).manifest.scripts.build,
      `${item.taskId} original build command`,
    );
  }
  console.log(`snapshot preparation: one real DAG, ${upstreamNames.join(', ')}`);
  await run('pnpm', buildArgs);
  const upstream = [...levels.keys()].sort().map((name) => byName.get(name));
  function snapshot() {
    const entries = [];
    function collect(dir) {
      for (const name of fs.readdirSync(path.join(root, dir)).sort()) {
        const file = path.join(dir, name);
        if (fs.statSync(path.join(root, file)).isDirectory()) collect(file);
        else
          entries.push([
            file,
            createHash('sha256')
              .update(fs.readFileSync(path.join(root, file)))
              .digest('hex'),
          ]);
      }
    }
    for (const item of upstream) {
      assert.ok(
        fs.existsSync(path.join(root, item.dir, 'dist/index.mjs')),
        `${item.manifest.name} build output missing`,
      );
      collect(path.join(item.dir, 'dist'));
    }
    return entries;
  }
  const upstreamSnapshot = snapshot();
  console.log(
    `snapshot: ${upstream.length} packages, ${upstreamSnapshot.length} files, SHA256 ${createHash('sha256').update(JSON.stringify(upstreamSnapshot)).digest('hex')}`,
  );
  for (const item of upstream) {
    const manifest = json(`${item.dir}/package.json`);
    delete manifest.scripts.build;
    write(`${item.dir}/package.json`, manifest);
  }
  // Read-only prebuilt upstream artifacts are allowed by D-3. Force below means
  // the real CLI producer, not another full rebuild of the upstream snapshots.
  assert.ok(!fs.existsSync(path.join(root, 'apps/fasrun-dev-cli/dist')));
  const fixedConfig = structuredClone(config);
  const fixedCli = structuredClone(cli);
  // Cold CLI: no CLI output or CLI cache, with the verified upstream snapshots.
  await run('pnpm', turbo());
  ordered();
  // Only seed later failure/legacy preconditions from this real successful build.
  // Every actual lifecycle scenario still invokes the real build/cache machinery.
  const seedDir = path.join(root, '.lifecycle-seed');
  const cliDist = path.join(root, 'apps/fasrun-dev-cli/dist');
  fs.cpSync(cliDist, seedDir, { recursive: true });
  function artifactHashes(dir) {
    return fs
      .readdirSync(dir, { recursive: true })
      .sort()
      .filter((file) => fs.statSync(path.join(dir, file)).isFile())
      .map((file) => [
        file,
        createHash('sha256')
          .update(fs.readFileSync(path.join(dir, file)))
          .digest('hex'),
      ]);
  }
  const seedHashes = artifactHashes(seedDir);
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
    fs.rmSync(cliDist, { recursive: true, force: true });
    fs.cpSync(seedDir, cliDist, { recursive: true });
    assert.deepEqual(artifactHashes(cliDist), seedHashes, 'real previous artifact seed changed');
    console.log('seed: restored verified prior real CLI build for next failure/legacy precondition');
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
  assert.deepEqual(snapshot(), upstreamSnapshot, 'read-only upstream artifact snapshot changed');
  console.log('snapshot: all upstream artifact hashes unchanged');
  console.log('lifecycle: all scenarios passed');
} catch (error) {
  console.error(`lifecycle failure: stage=${stage}; ${processes.safe(error.stack ?? error)}`);
  process.exitCode = fatalStatus ?? 1;
} finally {
  clearTimeout(totalTimer);
  process.removeListener('SIGTERM', onTerminate);
  try {
    await processes.stopAll();
    assert.equal(processes.size(), 0, 'subprocesses must close before fixture removal');
    fs.rmSync(root, { recursive: true, force: true });
    for (const [file, before] of hostShims)
      assert.ok(fs.readFileSync(file, 'utf8') === before, `host shim changed: ${path.relative(source, file)}`);
    console.log(
      `cleanup: direct children closed and process groups signalled before fixture removal; total=${Date.now() - started}ms`,
    );
  } catch (error) {
    console.error(`lifecycle cleanup failure: ${processes.safe(error.stack ?? error)}`);
    process.exitCode ||= 1;
  }
}
