import { spawn } from 'node:child_process';

// A result is settled by close (including a failed spawn), never by exit/error.
// Retain a bounded tail for diagnostics; do not echo credentials or local roots.
export function processScope({ env = process.env, redact = [] } = {}) {
  const active = new Set();
  let cancellation;
  const safe = (value) => {
    let result = String(value)
      .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
      .replace(/((?:token|password|secret|authorization)\s*[=:]\s*)\S+/gi, '$1[redacted]');
    for (const root of redact.filter(Boolean)) result = result.replaceAll(root, '[fixture-path]');
    return result.slice(-4096);
  };
  function kill(child) {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') return error.code ?? 'KILL_ERROR';
    }
  }
  function start(command, args, cwd) {
    if (cancellation) throw cancellation;
    const started = Date.now();
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let stdout = '';
    let spawnError;
    let killError;
    let outputLimit = false;
    const stop = () => {
      killError ??= kill(child);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      output = (output + data).slice(-65536);
      if (Buffer.byteLength(stdout) + Buffer.byteLength(data) > 8 * 1024 * 1024) {
        outputLimit = true;
        stop();
      } else stdout += data;
    });
    child.stderr.on('data', (data) => {
      output = (output + data).slice(-65536);
    });
    const handle = {
      child,
      output: () => stdout,
      stop,
      done: new Promise((resolve) => {
        child.once('error', (error) => {
          spawnError = error.code ?? 'SPAWN_ERROR';
        });
        child.once('close', (code, signal) => {
          // Also terminate descendants if the launcher exited ahead of them.
          stop();
          active.delete(handle);
          resolve({ code, signal, spawnError, killError, outputLimit });
        });
      }),
      evidence: (result) =>
        `exit=${result.code} signal=${result.signal ?? 'none'} spawn=${result.spawnError ?? 'none'} kill=${result.killError ?? 'none'} outputLimit=${result.outputLimit} elapsed=${Date.now() - started}ms\n${safe(output)}`,
    };
    active.add(handle);
    return handle;
  }
  function cancel(error) {
    cancellation ??= error;
    for (const handle of active) handle.stop();
  }
  async function stopAll() {
    const handles = [...active];
    for (const handle of handles) handle.stop();
    const results = await Promise.all(handles.map((handle) => handle.done));
    for (const result of results) checkCleanup(result);
  }
  function checkCleanup(result) {
    if (result.killError) throw new Error(`process group cleanup failed: ${result.killError}`);
  }
  async function using(handle, operation) {
    try {
      return await operation();
    } finally {
      handle.stop();
      checkCleanup(await handle.done);
    }
  }
  return {
    start,
    cancel,
    stopAll,
    using,
    safe,
    check: () => {
      if (cancellation) throw cancellation;
    },
    size: () => active.size,
  };
}
