import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('image tags follow build inputs, ignore Git history and local generated/secret files', () => {
  const root = mkdtempSync(join(tmpdir(), 'fasrun-tag-test-'));
  try {
    mkdirSync(join(root, 'deploy/docker'), { recursive: true });
    mkdirSync(join(root, 'apps/example'), { recursive: true });
    copyFileSync(new URL('./build.mjs', import.meta.url), join(root, 'deploy/docker/build.mjs'));
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n.env\ndist/\n');
    writeFileSync(join(root, 'apps/example/index.js'), 'export const version = 1;');
    execFileSync('git', ['init', '-q'], { cwd: root });
    const tag = (platform = 'linux/amd64') =>
      JSON.parse(
        execFileSync(process.execPath, ['deploy/docker/build.mjs', '--hash-only'], {
          cwd: root,
          env: { ...process.env, FASRUN_BUILD_PLATFORM: platform, FASRUN_IMAGE_MANIFEST: '' },
        }).toString(),
      )['fasrun-core-svc'];
    const initial = tag();
    assert.equal(tag(), initial);
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'], {
      cwd: root,
    });
    assert.equal(tag(), initial);
    writeFileSync(join(root, 'apps/example/.env'), 'SECRET=never-upload');
    mkdirSync(join(root, 'apps/example/node_modules'));
    writeFileSync(join(root, 'apps/example/node_modules/local.js'), 'generated');
    assert.equal(tag(), initial);
    writeFileSync(join(root, 'apps/example/index.js'), 'export const version = 2;');
    assert.notEqual(tag(), initial);
    assert.notEqual(tag('linux/arm64'), tag());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
