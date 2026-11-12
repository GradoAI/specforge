import { lstat, mkdir, mkdtemp, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { planSpecArchive } from '@fasrun/plugin-spec-common';
import { CliError, CliErrorCodes } from '../errors.js';
import { readSpecSnapshot } from './spec.js';

/** Refuse symlinks before reading or writing: an archive must stay inside its spec root. */
async function checkTree(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlink not allowed in specification tree: ${path}`);
  if (stat.isDirectory()) for (const name of await readdir(path)) await checkTree(join(path, name));
}

export async function runSpecArchive(changePath: string, date = new Date().toISOString().slice(0, 10)) {
  const change = resolve(changePath);
  const root = dirname(dirname(change));
  let staging: string | undefined;
  const replaced: { path: string; backup: string }[] = [];
  let archiveCreated = false;
  try {
    if (basename(dirname(change)) !== 'changes' || basename(change) === 'archive')
      throw new Error('Expected an active <spec-root>/changes/<change> directory');
    await checkTree(root);
    const { files, allowedPaths } = await readSpecSnapshot(root);
    const plan = planSpecArchive(files, allowedPaths, `changes/${basename(change)}`, date);
    const destination = join(root, plan.destination);
    try {
      await lstat(destination);
      throw new Error(`Archive exists: ${destination}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    staging = await mkdtemp(join(root, '.archive-'));
    const entries = Object.entries(plan.writes);
    for (const [index, [, text]] of entries.entries()) await writeFile(join(staging, `${index}.new`), text);
    try {
      await mkdir(join(root, 'changes/archive'));
      archiveCreated = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    for (const [index, [relative]] of entries.entries()) {
      const path = join(root, relative);
      const backup = join(staging, `${index}.old`);
      await rename(path, backup);
      replaced.push({ path, backup });
      await rename(join(staging, `${index}.new`), path);
    }
    // Final operation: all current specs are in place before the change directory is moved.
    await rename(change, destination);
    // Cleanup cannot invalidate a committed archive; retained temporary files are harmless if removal fails.
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return { archived: destination, updated: Object.keys(plan.writes) };
  } catch (error) {
    for (const { path, backup } of replaced.reverse()) await rename(backup, path);
    if (staging) await rm(staging, { recursive: true, force: true });
    if (archiveCreated) await rmdir(join(root, 'changes/archive'));
    throw new CliError(CliErrorCodes.CHECK_FAILED, (error as Error).message);
  }
}
