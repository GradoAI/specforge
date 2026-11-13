import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('SF-7 CLI build lifecycle', () => {
  it('TC-SF7-PLATFORM-001: subprocess failure cleanup precedes fixture removal', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./fixtures/cli-build-lifecycle/processes-check.mjs', import.meta.url))],
      { encoding: 'utf8', timeout: 10000 },
    );
    expect(result.error, result.stdout + result.stderr).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'process cleanup: observation failure, nested child, failed spawn and cancellation passed',
    );
  }, 15000);

  it('TC-SF7-PLATFORM-001/002: real producer, consumers, failures and package entries', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./fixtures/cli-build-lifecycle/run.mjs', import.meta.url))],
      {
        encoding: 'utf8',
        timeout: 240000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    // Keep successful stage timings visible as well as failure diagnostics.
    console.log(result.stdout);
    expect(result.error, result.stdout + result.stderr).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('lifecycle: all scenarios passed');
  }, 245000);
});
