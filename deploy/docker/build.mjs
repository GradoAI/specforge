// Hash the exact build context, Dockerfile, base digests and target platform, never the commit ID.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apps = ['fasrun-core-svc', 'fasrun-connect-svc', 'fasrun-portal-web', 'fasrun-dev-cli'];
const platform = process.env.FASRUN_BUILD_PLATFORM ?? (process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64');
if (!['linux/arm64', 'linux/amd64'].includes(platform)) throw new Error('Unsupported build platform');
const selected = process.argv.slice(2).filter((arg) => arg !== '--hash-only');
if (selected.some((app) => !apps.includes(app))) throw new Error('Unknown image name');
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root })
  .toString()
  .split('\0')
  .filter(Boolean)
  .filter(
    (file) =>
      /^(apps|packages|plugins|tools|deploy\/docker)\//.test(file) || /^[^/]+\.(json|yaml|yml|mjs|cjs)$/.test(file),
  )
  .sort();
const context = await mkdtemp(join(tmpdir(), 'fasrun-image-'));
try {
  const hash = createHash('sha256').update(platform);
  for (const file of files) {
    const source = join(root, file);
    const stat = await lstat(source);
    if (!stat.isFile()) throw new Error(`Build inputs must be regular files: ${file}`);
    hash
      .update(file)
      .update('\0')
      .update(String(stat.mode & 0o777))
      .update('\0')
      .update(await readFile(source))
      .update('\0');
    await mkdir(dirname(join(context, file)), { recursive: true });
    await cp(source, join(context, file));
  }
  const tag = hash.digest('hex');
  const images = {};
  for (const app of selected.length ? selected : apps) {
    const image = `${app}:${tag}`;
    images[app] = image;
    if (!process.argv.includes('--hash-only')) {
      execFileSync(
        'docker',
        [
          'build',
          '--platform',
          platform,
          '--file',
          join(context, 'deploy/docker', `${app}.Dockerfile`),
          '--tag',
          image,
          context,
        ],
        { stdio: 'inherit' },
      );
    }
  }
  console.log(JSON.stringify(images, null, 2));
  if (process.env.FASRUN_IMAGE_MANIFEST)
    await writeFile(process.env.FASRUN_IMAGE_MANIFEST, `${JSON.stringify(images, null, 2)}\n`);
} finally {
  await rm(context, { recursive: true, force: true });
}
