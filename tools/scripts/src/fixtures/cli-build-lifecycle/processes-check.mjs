import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processScope } from './processes.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-process-check-'));
const scope = processScope({ redact: [root] });
const ready = path.join(root, 'ready');
try {
  // A real descendant inherits pipes: close cannot settle while that process
  // keeps them open. Cancellation has to reach the detached process group.
  const child = scope.start(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { spawn } from 'node:child_process';
    import fs from 'node:fs';
    const nested = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
    nested.once('spawn', () => {
      console.log('postgres://user:private-password@localhost/db token=private-token');
      fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
    });
    setInterval(() => {}, 1000);
  `,
    ],
    root,
  );
  const timer = setTimeout(() => scope.cancel(new Error('readiness deadline')), 5000);
  while (!fs.existsSync(ready)) {
    scope.check();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  clearTimeout(timer);
  // Model the real observation assertion failure: preserve the error and settle
  // the active child before touching its fixture, not merely release a barrier.
  const observationError = new Error('observation assertion failed');
  let observed;
  try {
    await scope.using(child, async () => {
      throw observationError;
    });
  } catch (error) {
    observed = error;
  }
  assert.equal(observed, observationError);
  const result = await child.done;
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(scope.size(), 0);
  assert.ok(fs.existsSync(ready), 'fixture exists until close acknowledgement');
  assert.doesNotMatch(child.evidence(result), /private-password|private-token/);

  const failedSpawn = scope.start(path.join(root, 'absent-executable'), [], root);
  const failedResult = await failedSpawn.done;
  assert.equal(failedResult.spawnError, 'ENOENT');
  assert.equal(scope.size(), 0);

  const machine = scope.start(
    process.execPath,
    [
      '-e',
      'process.stderr.write("diagnostic warning\\n"); process.stdout.write(JSON.stringify({ value: "x".repeat(70000) }))',
    ],
    root,
  );
  assert.equal((await machine.done).code, 0);
  assert.equal(JSON.parse(machine.output()).value.length, 70000, 'machine stdout is not a diagnostic tail');
  const overflow = scope.start(
    process.execPath,
    ['-e', 'process.stdout.write("x".repeat(9 * 1024 * 1024)); setInterval(() => {}, 1000)'],
    root,
  );
  assert.equal((await overflow.done).outputLimit, true, 'oversized output fails explicitly');

  const deadlineScope = processScope();
  const waiting = deadlineScope.start(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], root);
  const deadline = new Error('injected total deadline');
  deadlineScope.cancel(deadline);
  await deadlineScope.stopAll();
  assert.equal((await waiting.done).signal, 'SIGKILL');
  assert.throws(
    () => deadlineScope.check(),
    (error) => error === deadline,
  );
  assert.throws(
    () => deadlineScope.start(process.execPath, [], root),
    (error) => error === deadline,
  );
  assert.equal(deadlineScope.size(), 0);
  console.log('process cleanup: observation failure, nested child, failed spawn and cancellation passed');
} finally {
  await scope.stopAll();
  fs.rmSync(root, { recursive: true, force: true });
}
