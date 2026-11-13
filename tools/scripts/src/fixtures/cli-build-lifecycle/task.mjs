import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const control = path.join(root, '.lifecycle');
const role = process.argv[2];
const mark = (event) => appendFileSync(`${control}/events`, `${event}\n`);
if (role === 'build' || role === 'baseline') {
  if (role === 'build' && existsSync(`${control}/legacy`)) {
    const { setTimeout } = await import('node:timers/promises');
    const deadline = Date.now() + 15000;
    while (!existsSync(`${control}/baseline`)) {
      if (Date.now() > deadline) process.exit(26);
      await setTimeout(20);
    }
  }
  mark('build:start');
  const built = spawnSync(
    'pnpm',
    ['exec', 'tsdown', 'src/index.ts', 'src/help.ts', '--format', 'esm', '--platform', 'node'],
    {
      stdio: 'inherit',
      timeout: 45000,
      env: { ...process.env, LIFECYCLE_BASELINE: role === 'baseline' ? '1' : '0' },
    },
  );
  if (built.status !== 0) process.exit(built.status ?? 1);
  mark('build:done');
  if (role === 'baseline') writeFileSync(`${control}/baseline`, '');
} else if (role === 'independent') {
  mark('independent:done');
} else {
  mark(`${role}:start`);
  if (existsSync(`${control}/legacy`) && role === 'migration') {
    // In the legacy graph this consumer races the test's second producer.
    const { setTimeout } = await import('node:timers/promises');
    const deadline = Date.now() + 15000;
    while (!existsSync(`${control}/cleaned`)) {
      if (Date.now() > deadline) process.exit(25);
      await setTimeout(20);
    }
  }
  const cli = spawnSync(process.execPath, [path.join(root, 'apps/fasrun-dev-cli/bin/run.js'), '--version'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  process.stdout.write(cli.stdout ?? '');
  process.stderr.write(cli.stderr ?? '');
  if (role === 'migration')
    writeFileSync(`${control}/migration-finished`, JSON.stringify({ status: cli.status, stderr: cli.stderr }));
  if (cli.status !== 0) process.exit(cli.status ?? 1);
  mark(`${role}:done`);
}
