// T012 discovers migration inputs from host manifests, without loading host code.
import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const out = process.argv[2];
const plugins = new Set();
for (const host of ['fasrun-core-svc', 'fasrun-connect-svc']) {
  const dir = join('apps', host);
  await mkdir(join(out, dir), { recursive: true });
  await cp(join(dir, 'package.json'), join(out, dir, 'package.json'));
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies)) {
    if (/^@fasrun\/plugin-[a-z][a-z0-9-]*-backend$/.test(name)) plugins.add(name);
  }
}
for (const name of plugins) {
  const plugin = name.slice('@fasrun/plugin-'.length, -'-backend'.length);
  const dir = join('plugins', plugin, `${plugin}-backend`, 'migrations');
  await cp(dir, join(out, dir), { recursive: true });
}
