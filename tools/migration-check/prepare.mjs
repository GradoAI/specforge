// Isolated, locked tooling; never executes dependency lifecycle scripts or changes allowBuilds.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const runtime = resolve(here, 'runtime');
const lock = await readFile(resolve(runtime, 'package-lock.json'));
const hash = createHash('sha256').update(lock).digest('hex');
const marker = resolve(runtime, 'node_modules/.installed-lock');
if (!existsSync(marker) || (await readFile(marker, 'utf8')) !== hash) {
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: runtime, stdio: 'inherit' });
  await writeFile(marker, hash);
}
// 0.31.9's API discards params during introspection (including composite keys).
// Keep the narrow adapter explicit and fail on upstream changes; SQL remains parameterized.
const api = await readFile(resolve(runtime, 'node_modules/drizzle-kit/api.js'), 'utf8');
const before = 'const res = await drizzleInstance.execute(sql.raw(query));';
const start = api.indexOf('var pushSchema = async');
const end = api.indexOf('var startStudioPostgresServer', start);
const section = api.slice(start, end);
if (start < 0 || end < start || section.split(before).length !== 2)
  throw new Error('Unexpected pinned drizzle-kit API: inspect adapter');
await writeFile(
  resolve(runtime, 'node_modules/drizzle-kit/fasrun-api.cjs'),
  api.slice(0, start) +
    section.replace(before, 'const res = await drizzleInstance.$client.query(query, params);') +
    api.slice(end),
);
const platforms = {
  'darwin-arm64': ['squawk-darwin-arm64', '6132cb9779c688303e43746e10268f280b35a3fbcc70b851472021cc882ef5a2'],
  'linux-x64': ['squawk-linux-x64', 'ab978cb412e5e5eb2f06aaa4c5035a1567f6eba53274d7d1e068f73169b88bbd'],
};
const entry = platforms[`${process.platform}-${process.arch}`];
if (!entry) throw new Error('Unsupported Squawk platform; add a verified official asset');
const binary = resolve(runtime, 'node_modules/.bin/squawk');
if (
  !existsSync(binary) ||
  createHash('sha256')
    .update(await readFile(binary))
    .digest('hex') !== entry[1]
) {
  const response = await fetch(`https://github.com/sbdchd/squawk/releases/download/v2.71.0/${entry[0]}`);
  if (!response.ok) throw new Error(`Squawk download: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== entry[1]) throw new Error('Squawk SHA256 mismatch');
  await mkdir(dirname(binary), { recursive: true });
  await writeFile(binary, bytes);
  await chmod(binary, 0o755);
}
await rm(resolve(here, 'dist/schemas'), { recursive: true, force: true });
for (const plugin of await readdir(resolve(root, 'plugins'))) {
  const schema = resolve(root, `plugins/${plugin}/${plugin}-backend/src/infrastructure/schema/index.ts`);
  if (existsSync(schema))
    execFileSync(
      'pnpm',
      [
        'exec',
        'tsdown',
        schema,
        '--format',
        'esm',
        '--platform',
        'node',
        '--no-dts',
        '--external',
        'drizzle-orm',
        '--external',
        '@fasrun/backend-defaults',
        '--out-dir',
        resolve(here, `dist/schemas/${plugin}`),
      ],
      { cwd: here, stdio: 'inherit' },
    );
}

execFileSync(
  'pnpm',
  [
    'exec',
    'tsdown',
    'src/cli.ts',
    'src/diff-worker.ts',
    '--format',
    'esm',
    '--platform',
    'node',
    '--no-clean',
    '--no-dts',
    '--external',
    '@testcontainers/postgresql',
    '--external',
    '@fasrun/test-utils',
    '--external',
    'drizzle-orm',
    '--external',
    'pg',
  ],
  { cwd: here, stdio: 'inherit' },
);
