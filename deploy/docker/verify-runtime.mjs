import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
for (const app of ['fasrun-core-svc', 'fasrun-connect-svc', 'fasrun-portal-web', 'fasrun-dev-cli']) {
  const image = manifest[app];
  assert.match(image ?? '', new RegExp(`^${app}:[a-f0-9]{64}$`));
  const user = execFileSync('docker', ['image', 'inspect', '--format', '{{.Config.User}}', image], {
    encoding: 'utf8',
  }).trim();
  assert.equal(user, '65532:65532', `${app}: configured non-root user`);
  const uid = execFileSync(
    'docker',
    ['run', '--rm', '--network', 'none', '--entrypoint', '/nodejs/bin/node', image, '-p', 'process.getuid()'],
    { encoding: 'utf8', timeout: 30_000 },
  ).trim();
  assert.equal(uid, '65532', `${app}: actual runtime UID`);
  console.log(`TC-PLATFORM-041 ${app}: Config.User=${user}, process.getuid()=${uid}`);
}
