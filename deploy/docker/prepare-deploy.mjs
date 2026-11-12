// Keep application sources and development fixtures out of the production export.
import { readFile, writeFile } from 'node:fs/promises';
const file = `apps/${process.argv[2]}/package.json`;
const manifest = JSON.parse(await readFile(file, 'utf8'));
manifest.files = ['dist', 'bin'];
await writeFile(file, JSON.stringify(manifest));
