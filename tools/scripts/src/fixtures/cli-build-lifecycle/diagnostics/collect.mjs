import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { location, packages, processLedger, summarize, traceParser } from './analyze.mjs';

export const target = Object.freeze({
  sha: 'b59b9f4b588d4aa819baa071fec8b902692fa884',
  tree: 'ed499ca7e027965a564a0517922d49c74ed18bbe',
  head: '88e5c18fe1a5bb2acad97a7fe320c020663aa834',
  base: '101cb1807411eb834e6ce940dbe5324671e1d09a',
});
export const limits = Object.freeze({ artifactBytes: 64 * 1024 * 1024, sampleMs: 200, commandMs: 60000 });
const fixture = 'tools/scripts/src/fixtures/cli-build-lifecycle';
const sixArgs = [
  'exec',
  'turbo',
  'run',
  'build',
  ...Object.values(packages)
    .sort()
    .map((name) => `--filter=${name}`),
  '--cache=local:rw',
];

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(
    result.status,
    0,
    `preparation command failed: ${executable}; status=${result.status}; signal=${result.signal}; error=${result.error?.code ?? 'none'}`,
  );
  return result.stdout.trim();
}
export function snapshot(root) {
  assert.equal(command(root, 'git', ['rev-parse', 'HEAD']), target.sha, 'fixed checkout mismatch');
  assert.equal(command(root, 'git', ['rev-parse', 'HEAD^{tree}']), target.tree, 'fixed tree mismatch');
  assert.equal(command(root, 'git', ['status', '--porcelain', '--untracked-files=no']), '', 'tracked source changed');
  const files = command(root, 'git', ['ls-files', '-z']).split('\0').filter(Boolean);
  const hash = createHash('sha256');
  for (const file of files) {
    const full = path.join(root, file);
    hash.update(file).update('\0');
    hash.update(fs.lstatSync(full).isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full));
    hash.update('\0');
  }
  return { ...target, trackedCount: files.length, digest: hash.digest('hex') };
}
export function verifyBudgets(root) {
  const run = fs.readFileSync(path.join(root, fixture, 'run.mjs'), 'utf8');
  for (const token of ['220000', '60000', '45000', '30000'])
    assert.ok(run.includes(token), `missing original budget ${token}`);
  const wrapper = fs.readFileSync(path.join(root, 'tools/scripts/src/cli-build-lifecycle.test.ts'), 'utf8');
  for (const token of ['240000', '245000']) assert.ok(wrapper.includes(token), `missing wrapper budget ${token}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.test, 'turbo run test');
}
export function verifyGraph(root) {
  const manifests = command(root, 'git', ['ls-files', '-z'])
    .split('\0')
    .filter((file) => file.endsWith('package.json') && !file.includes('/fixtures/'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
  const byName = new Map(manifests.filter((manifest) => manifest.name).map((manifest) => [manifest.name, manifest]));
  const closure = new Set();
  function visit(name) {
    if (closure.has(name)) return;
    closure.add(name);
    const manifest = byName.get(name);
    assert.ok(manifest, 'runtime workspace dependency missing');
    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (version.startsWith('workspace:')) visit(dependency);
    }
  }
  for (const [name, version] of Object.entries(byName.get('@fasrun/fasrun-dev-cli').dependencies)) {
    if (version.startsWith('workspace:')) visit(name);
  }
  assert.deepEqual([...closure].sort(), Object.values(packages).sort(), 'actual CLI runtime closure changed');
  const graph = JSON.parse(command(root, 'pnpm', [...sixArgs, '--dry=json']));
  assert.deepEqual(
    graph.tasks.map((task) => task.taskId).sort(),
    Object.values(packages)
      .map((name) => `${name}#build`)
      .sort(),
  );
  for (const [directory, name] of Object.entries(packages)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
    assert.equal(graph.tasks.find((task) => task.taskId === `${name}#build`).command, manifest.scripts.build);
  }
  const rootGraph = JSON.parse(command(root, 'pnpm', ['exec', 'turbo', 'run', 'test', '--dry=json']));
  // Read-only dry parsing, no warm-up builds. Commands come from the verified tree.
  return {
    six: graph.tasks.map(({ taskId, command, dependencies }) => ({ taskId, command, dependencies })),
    root: rootGraph.tasks.map(({ taskId, dependencies }) => ({ taskId, dependencies })),
  };
}

export function evidenceWriter(directory, maxBytes = limits.artifactBytes) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const fd = fs.openSync(path.join(directory, 'events.jsonl'), 'wx', 0o600);
  let bytes = 0;
  let capped = false;
  let closed = false;
  // Reserve 1MiB for status even after truncation. Summary is independently bounded.
  return {
    add(record) {
      if (closed || capped) return;
      const line = `${JSON.stringify(record)}\n`;
      const length = Buffer.byteLength(line);
      if (bytes + length > Math.max(0, maxBytes - 1024 * 1024)) {
        capped = true;
        return;
      }
      fs.writeSync(fd, line);
      bytes += length;
    },
    finish(summary) {
      if (!closed) {
        fs.closeSync(fd);
        closed = true;
      }
      const result = { ...summary, evidenceBytes: bytes, capped };
      let text = JSON.stringify(result, null, 2);
      if (Buffer.byteLength(text) > Math.min(1024 * 1024, maxBytes - bytes)) {
        text = JSON.stringify({
          status: 'incomplete',
          reason: 'summary-cap',
          capped: true,
          evidenceBytes: bytes,
          originalTest: summary.originalTest,
          testStarted: summary.testStarted,
          rootCause: 'UNPROVEN',
        });
      }
      fs.writeFileSync(path.join(directory, 'summary.json'), text, { mode: 0o600 });
      return result;
    },
    get capped() {
      return capped;
    },
  };
}

function numericFile(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.every((part) => /^[-\w.:=]+$/.test(part)));
  } catch {
    return null;
  }
}
export function procSample(pid, pageSize) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const values = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return {
      startTicks: Number(values[19]),
      ppid: Number(values[1]),
      pgid: Number(values[2]),
      cpuTicks: Number(values[11]) + Number(values[12]),
      rssBytes: Number(values[21]) * pageSize,
      schedstat: numericFile(`/proc/${pid}/schedstat`),
      io: numericFile(`/proc/${pid}/io`),
    };
  } catch {
    return null;
  }
}
function systemSample() {
  return {
    cpu:
      numericFile('/proc/stat')?.filter((line) => /^(cpu\d*|ctxt|procs_running|procs_blocked)$/.test(line[0])) ?? null,
    pressure: Object.fromEntries(['cpu', 'memory', 'io'].map((name) => [name, numericFile(`/proc/pressure/${name}`)])),
    cgroup: Object.fromEntries(
      ['cpu.stat', 'cpu.max', 'memory.current', 'memory.max', 'memory.events'].map((name) => [
        name,
        numericFile(`/sys/fs/cgroup/${name}`),
      ]),
    ),
  };
}

// Data is decoded one bounded line at a time and immediately reduced to allowed
// fields. The raw strace pipe and test output are never persisted or echoed.
export function lineStream(stream, onLine, onLoss) {
  let tail = '';
  let discard = false;
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    for (const part of chunk.split(/(?<=\n)/)) {
      if (!discard) tail += part;
      if (tail.length > 65536) {
        tail = '';
        discard = true;
        onLoss();
      }
      if (part.endsWith('\n')) {
        if (!discard) onLine(tail.trimEnd());
        tail = '';
        discard = false;
      }
    }
  });
  stream.on('end', () => {
    if (tail) onLine(tail);
    if (discard) onLoss();
  });
  stream.on('error', onLoss);
}

export async function traced(root, executable, args, writer, { probe = false } = {}) {
  const start = performance.now();
  const cpu = process.cpuUsage();
  const ledger = processLedger();
  let loss = 0;
  let traceLines = 0;
  let groups = 0;
  let cancelled = null;
  let spawnError = false;
  const pageSize = Number(command(root, 'getconf', ['PAGESIZE']));
  const clockTicks = Number(command(root, 'getconf', ['CLK_TCK']));
  const anchor = { utc: Date.now() / 1000, monotonicMs: performance.now() };
  const parser = traceParser(
    (event) => {
      if (writer.capped) return;
      if (event.kind === 'group' && event.result >= 0) groups++;
      const id = ledger.add(event);
      writer.add({ ...event, id, monotonicMs: anchor.monotonicMs + (event.utc - anchor.utc) * 1000 });
    },
    (pid) => {
      try {
        return location(fs.readlinkSync(`/proc/${pid}/cwd`), root);
      } catch {
        return location(null, root);
      }
    },
  );
  const transport = fs.mkdtempSync(path.join(os.tmpdir(), 'sf7-trace-'));
  const fifo = path.join(transport, 'events');
  command(root, 'mkfifo', ['-m', '600', fifo]);
  // Node child stdio pipes are sockets on Linux and cannot be reopened via
  // /dev/fd/N. A private FIFO keeps raw trace bytes off disk. Hold RDWR until
  // strace settles so failed spawn/options cannot leave a blocked FIFO open.
  const hold = fs.openSync(fifo, fs.constants.O_RDWR);
  const traceStream = fs.createReadStream(fifo);
  const drained = new Promise((resolve) => {
    traceStream.once('close', resolve);
  });
  const child = spawn(
    'strace',
    [
      '-f',
      '-q',
      '-ttt',
      '-T',
      '-s',
      '4096',
      '--kill-on-exit',
      '-e',
      'trace=%process,setsid,setpgid',
      '-o',
      fifo,
      '--',
      executable,
      ...args,
    ],
    {
      cwd: root,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const signal = (name) => {
    cancelled ??= name;
    // Give the target/fixture its existing SIGTERM/finally cleanup first. Do not
    // remove its files. Hard job cancellation remains an explicitly missing case.
    try {
      if (child.pid && child.exitCode === null) process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* launcher already settled */
    }
    for (const pid of ledger.live()) {
      // Never signal a reused PID from a stale/capped event stream.
      const identity = ledger.identity(pid);
      if (!identity || procSample(pid, pageSize)?.startTicks !== identity) continue;
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already reaped */
      }
    }
  };
  const onInt = () => signal('SIGINT');
  const onTerm = () => signal('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  lineStream(
    traceStream,
    (line) => {
      traceLines++;
      parser.line(line);
    },
    () => loss++,
  );
  let outputBytes = 0;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      outputBytes += chunk.length;
    });
    lineStream(
      stream,
      (line) => {
        const cases = [...new Set(line.match(/TC-[A-Z0-9]+(?:-[A-Z0-9]+)+/g) ?? [])];
        if (cases.length) writer.add({ kind: 'test-reference', monotonicMs: performance.now(), cases });
        if (line.includes('60s deadline:'))
          writer.add({ kind: 'fixture-deadline', milliseconds: 60000, monotonicMs: performance.now() });
        if (line.includes('lifecycle total deadline exceeded'))
          writer.add({ kind: 'fixture-deadline', milliseconds: 220000, monotonicMs: performance.now() });
      },
      () => loss++,
    );
  }
  let samples = 0;
  let last = performance.now();
  let maxSampleGapMs = 0;
  const sample = () => {
    const now = performance.now();
    maxSampleGapMs = Math.max(maxSampleGapMs, now - last);
    last = now;
    samples++;
    if (Math.abs(Date.now() / 1000 - anchor.utc - (now - anchor.monotonicMs) / 1000) > 0.05) loss++;
    writer.add({
      kind: 'system',
      monotonicMs: now,
      utc: Date.now() / 1000,
      ...systemSample(),
      observer: process.resourceUsage(),
    });
    for (const pid of ledger.live()) {
      const value = procSample(pid, pageSize);
      if (!value) continue;
      ledger.sample(pid, value);
      writer.add({ kind: 'resource', pid, monotonicMs: now, ...value });
    }
  };
  const timer = setInterval(sample, limits.sampleMs);
  let probeTimeout;
  if (probe)
    probeTimeout = setTimeout(() => {
      cancelled = 'probe-deadline';
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already closed */
      }
    }, 10000);
  let result;
  try {
    result = await new Promise((resolve) => {
      child.once('error', () => {
        spawnError = true;
      });
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    fs.closeSync(hold);
    await drained;
    traceStream.destroy();
    clearInterval(timer);
    clearTimeout(probeTimeout);
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
    fs.rmSync(transport, { recursive: true, force: true });
  }
  const state = ledger.result();
  const parse = parser.status();
  return {
    ...result,
    cancelled,
    spawnError,
    traceLines,
    groups,
    outputBytes,
    samples,
    maxSampleGapMs,
    clockTicks,
    pageSize,
    elapsedMs: performance.now() - start,
    observerCpuMicros: process.cpuUsage(cpu),
    observerResource: process.resourceUsage(),
    anchor,
    parse,
    loss,
    ledger: state,
    complete:
      !spawnError &&
      !cancelled &&
      !loss &&
      !parse.rejected &&
      !parse.pending &&
      state.complete &&
      traceLines > 0 &&
      !writer.capped,
  };
}

export function acceptProbe(result) {
  const processes = result.ledger.processes;
  assert.ok(result.complete && result.code === 0 && result.signal === null, 'exit backend incomplete');
  assert.ok(
    processes.some((process) => process.exit?.code === 7),
    'nonzero child missing',
  );
  assert.ok(
    processes.some((process) => process.exit?.signal === 'SIGKILL'),
    'SIGKILL child missing',
  );
  assert.ok(
    processes.filter((process) => process.exit?.code === 0 && process.parent).length >= 2,
    'short children missing',
  );
  assert.ok(
    processes.some((process) => process.parent && process.execs.length),
    'exec/parent relationship missing',
  );
  assert.ok(result.groups > 0, 'process group evidence missing');
  // PID reuse cannot be forced safely on a hosted runner. Exercise the same
  // ledger with two synthetic lifetimes, in addition to the live backend probe.
  const reuse = processLedger();
  reuse.add({ kind: 'exec', pid: 123, utc: 1 });
  reuse.add({ kind: 'exit', pid: 123, utc: 2 });
  reuse.add({ kind: 'exec', pid: 123, utc: 3 });
  reuse.add({ kind: 'exit', pid: 123, utc: 4 });
  assert.equal(new Set(reuse.result().processes.map((process) => process.id)).size, 2);
}

export async function preflight(root, writer) {
  const version = command(root, 'strace', ['--version']).split('\n')[0];
  assert.match(version, /^strace -- version \d+\.\d+/);
  writer.add({ kind: 'backend', version });
  const script = `const {spawnSync}=require('node:child_process');
    spawnSync('/bin/true',[],{detached:true}); spawnSync('/bin/sh',['-c','exit 7']);
    spawnSync('/bin/sh',['-c','kill -KILL $$']);
    spawnSync('/bin/sh',['-c','/bin/true & wait']);`;
  const result = await traced(root, process.execPath, ['-e', script], writer, { probe: true });
  acceptProbe(result);
  return { version, ...result };
}

function versions(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(command(root, 'pnpm', ['--version']), lock.packageManager.split('@').at(-1));
  return {
    node: process.version,
    packageManager: lock.packageManager,
    pnpm: command(root, 'pnpm', ['--version']),
    turbo: command(root, 'pnpm', ['exec', 'turbo', '--version']),
    tsdown: command(root, 'pnpm', ['--dir', 'packages/contracts-core', 'exec', 'tsdown', '--version']),
    typescript: command(root, 'pnpm', ['exec', 'tsc', '--version']),
  };
}

async function main() {
  assert.equal(process.argv.length, 3, 'only verify or collect is accepted; no target/command inputs');
  const mode = process.argv[2];
  assert.ok(['verify', 'collect'].includes(mode));
  const root = process.cwd();
  const temp = fs.realpathSync(process.env.RUNNER_TEMP);
  assert.ok(!fileURLToPath(import.meta.url).startsWith(`${root}/`), 'observer must be outside target');
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  assert.equal(process.version, 'v24.22.2');
  const current = snapshot(root);
  verifyBudgets(root);
  const stateFile = path.join(temp, 'sf7-source.json');
  if (mode === 'verify') {
    fs.writeFileSync(stateFile, JSON.stringify(current), { flag: 'wx', mode: 0o600 });
    console.log('Fixed source verified before install.');
    return;
  }
  assert.deepEqual(current, JSON.parse(fs.readFileSync(stateFile, 'utf8')), 'source changed during install');
  const writer = evidenceWriter(path.join(temp, 'sf7-evidence'));
  let test = null;
  let precheck = null;
  let summary = null;
  let sourceAfter = false;
  let failure = null;
  let phase = 'graph-preflight';
  const started = performance.now();
  try {
    const graph = verifyGraph(root);
    writer.add({ kind: 'graph', ...graph });
    writer.add({
      kind: 'environment',
      source: current,
      tools: versions(root),
      facility: /^[a-f0-9]{40}$/.test(process.env.SF7_FACILITY_SHA ?? '') ? process.env.SF7_FACILITY_SHA : null,
      kernel: os.release(),
      architecture: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model,
      memoryBytes: os.totalmem(),
      image: /^\d{8}\.\d+\.\d+$/.test(process.env.ImageVersion ?? '') ? process.env.ImageVersion : null,
      cacheHit: ['true', 'false'].includes(process.env.SF7_CACHE_HIT) ? process.env.SF7_CACHE_HIT : 'unknown',
      cacheKey: `node-cache-Linux-x64-pnpm-${createHash('sha256').update(fs.readFileSync('pnpm-lock.yaml')).digest('hex')}`,
      cacheKeyMeaning: 'Expected setup-node pnpm key; action log is authoritative for actual key/hit.',
      differences: [
        'workflow_dispatch rather than pull_request',
        'runner image and hardware are not guaranteed identical',
        'strace ptrace and 200ms sampling overhead; no baseline subtraction',
      ],
    });
    phase = 'exit-backend-preflight';
    precheck = await preflight(root, writer);
    writer.add({ kind: 'preflight', ...precheck, ledger: undefined });
    // Final refusal boundary: no pnpm test until backend and source both pass.
    assert.deepEqual(snapshot(root), current);
    phase = 'original-full-test';
    test = await traced(root, 'pnpm', ['test'], writer);
    phase = 'analysis-and-source-postcheck';
    summary = summarize(test.ledger, graph.six);
    assert.deepEqual(snapshot(root), current);
    sourceAfter = true;
  } catch (error) {
    // Stable categories only; assertion errors may embed argv, paths or contents.
    failure = error?.code === 'ENOENT' ? 'missing-backend-or-input' : 'verification-or-observation-failed';
  } finally {
    const complete = Boolean(test?.complete && summary?.complete && sourceAfter && !writer.capped && !failure);
    writer.finish({
      status: complete ? 'complete' : 'incomplete',
      testStarted: test !== null,
      originalTest: test ? { code: test.code, signal: test.signal, cancelled: test.cancelled } : null,
      failure,
      phase,
      sourceAfter,
      elapsedMs: performance.now() - started,
      preflightPassed: precheck !== null,
      observation: test ? { ...test, ledger: { ...test.ledger, processes: undefined } } : null,
      analysis: summary,
      rootCause: 'UNPROVEN',
      cleanup:
        'Collector timers/streams settled before final artifact; target resources are never removed by observer. Hard runner termination may prevent final evidence.',
    });
    // Preserve a test failure; an otherwise successful test cannot mask loss.
    process.exitCode = test?.code
      ? test.code
      : test?.signal
        ? 128 + (os.constants.signals[test.signal] ?? 0)
        : complete
          ? 0
          : 2;
    console.log(
      `SF-7 diagnostic: testStarted=${test !== null}; evidence=${complete ? 'complete' : 'incomplete'}; exit=${process.exitCode}; rootCause=UNPROVEN`,
    );
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('SF-7 diagnostic refused before test start.');
    process.exitCode = 2;
  });
}
