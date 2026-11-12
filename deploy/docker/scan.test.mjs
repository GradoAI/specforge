import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('scan gate preserves failures while collecting every SBOM; missing images fail closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fasrun-scan-test-'));
  try {
    writeFileSync(
      join(dir, 'trivy'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SCAN_LOG"\ncase "$*" in *--exit-code*) exit 1 ;; esac\n',
    );
    chmodSync(join(dir, 'trivy'), 0o755);
    const manifest = join(dir, 'images.json');
    const images = Object.fromEntries(
      ['fasrun-core-svc', 'fasrun-connect-svc', 'fasrun-portal-web', 'fasrun-dev-cli'].map((app) => [
        app,
        `${app}:${'a'.repeat(64)}`,
      ]),
    );
    writeFileSync(manifest, JSON.stringify(images));
    const log = join(dir, 'calls');
    const run = () =>
      spawnSync('bash', [fileURLToPath(new URL('./scan.sh', import.meta.url)), join(dir, 'reports'), manifest], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SCAN_LOG: log },
        encoding: 'utf8',
      });
    assert.equal(run().status, 1);
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(calls.length, 10);
    assert.equal(calls.filter((line) => line.includes('--format cyclonedx')).length, 5);
    assert.equal(calls.filter((line) => line.includes('--severity CRITICAL --exit-code 1')).length, 5);
    delete images['fasrun-dev-cli'];
    writeFileSync(manifest, JSON.stringify(images));
    assert.equal(run().status, 1);
    assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
