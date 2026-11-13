import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import {
  planSpecArchive,
  archiveBindingSchema,
  archiveOperationSchema,
  encodeArchiveOperation,
  assertArchiveApproval,
  requireArchiveContext,
  type ArchiveOperation,
  type ArchiveBinding,
  type ArchiveAuthority,
} from '@fasrun/plugin-spec-common';
import { CliError, CliErrorCodes } from '../errors.js';
import { readSpecSnapshot } from './spec.js';

/** Refuse symlinks before reading or writing: an archive must stay inside its spec root. */
async function checkTree(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlink not allowed in specification tree: ${path}`);
  if (stat.isDirectory()) for (const name of await readdir(path)) await checkTree(join(path, name));
  else if (!stat.isFile()) throw new Error('Special files are not allowed in specification trees');
}

/** Human-only M0 command. Never register this function/CLI command as an M1 agent capability. */
export async function runSpecArchive(changePath: string, date = new Date().toISOString().slice(0, 10)) {
  return executeArchive(changePath, date);
}

async function executeArchive(
  changePath: string,
  date: string,
  guard?: (plan: ReturnType<typeof planSpecArchive>) => Promise<void>,
) {
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
    // All authorization and snapshot checks precede the first mutation, including staging creation.
    await guard?.(plan);
    staging = await mkdtemp(join(root, '.archive-'));
    const entries = orderedWrites(plan);
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

async function captureInputs(root: string): Promise<ArchiveOperation['inputs']> {
  const inputs: ArchiveOperation['inputs'] = [];
  async function walk(path: string): Promise<void> {
    for (const name of (await readdir(join(root, path))).sort()) {
      const file = path ? `${path}/${name}` : name;
      const stat = await lstat(join(root, file));
      if (stat.isSymbolicLink()) throw new Error('Symlink not allowed in specification tree');
      if (stat.isDirectory()) {
        inputs.push({ kind: 'directory', path: file });
        await walk(file);
      } else if (stat.isFile())
        inputs.push({ kind: 'file', path: file, bytes: (await readFile(join(root, file))).toString('base64') });
      else throw new Error('Special files are not allowed in specification trees');
    }
  }
  await walk('');
  return inputs;
}
function orderedWrites(plan: ReturnType<typeof planSpecArchive>) {
  return Object.entries(plan.writes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
function operation(
  binding: ArchiveBinding,
  inputs: ArchiveOperation['inputs'],
  plan: ReturnType<typeof planSpecArchive>,
): ArchiveOperation {
  return archiveOperationSchema.parse({
    version: 1,
    binding,
    inputs,
    actions: [
      ...orderedWrites(plan).map(([path, text]) => ({ kind: 'write', path, text })),
      { kind: 'move', from: binding.change, to: plan.destination },
    ],
  });
}
function digest(operation: ArchiveOperation): string {
  return createHash('sha256').update(encodeArchiveOperation(operation)).digest('hex');
}
/** Trusted host construction only. The returned M1 facade has no manual-mode switch or fallback.
 * Caller must exclusively own the workspace for preparation/execution; this is not a process lock.
 */
export function createAuthorizedSpecArchiver(options: {
  repositoryId: string;
  repositoryRoot: string;
  specRoot: string;
  authority: ArchiveAuthority;
}) {
  // Keep trusted construction inputs separate from mutable caller request objects.
  const { repositoryId, repositoryRoot, specRoot, authority } = options;
  async function bindingFor(change: string, date: string): Promise<ArchiveBinding> {
    const binding = archiveBindingSchema.parse({
      repositoryId,
      repositoryRoot: resolve(repositoryRoot),
      specRoot,
      change,
      date,
    });
    const repo = await realpath(binding.repositoryRoot);
    if (repo !== binding.repositoryRoot) throw new Error('Repository root must be canonical, not a symlink');
    const root = resolve(repo, binding.specRoot);
    const location = relative(repo, root);
    if (!location || location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location))
      throw new Error('Invalid specification root');
    let current = repo;
    for (const segment of location.split(sep)) {
      current = join(current, segment);
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Invalid specification root');
    }
    if (
      basename(dirname(change)) !== 'changes' ||
      change !== `changes/${basename(change)}` ||
      basename(change) === 'archive'
    )
      throw new Error('Expected an active change');
    return binding;
  }
  async function readContext(binding: ArchiveBinding) {
    try {
      return requireArchiveContext(await authority.resolveContext(structuredClone(binding)));
    } catch {
      throw new Error('Archive read authorization denied');
    }
  }
  async function authorized(operation: ArchiveOperation): Promise<void> {
    const context = await readContext(operation.binding);
    const hash = digest(operation);
    try {
      const approval = await authority.authorize(structuredClone(context), structuredClone(operation), hash);
      assertArchiveApproval(context, hash, approval);
    } catch {
      throw new Error('Archive execution authorization denied');
    }
  }
  async function prepare(change: string, date: string): Promise<ArchiveOperation> {
    const binding = await bindingFor(change, date);
    // Read authorization is checked before touching any specification contents.
    await readContext(binding);
    const root = resolve(binding.repositoryRoot, binding.specRoot);
    await checkTree(root);
    const inputs = await captureInputs(root);
    const { files, allowedPaths } = await readSpecSnapshot(root);
    const planned = operation(binding, inputs, planSpecArchive(files, allowedPaths, binding.change, binding.date));
    if (JSON.stringify(await captureInputs(root)) !== JSON.stringify(inputs)) throw new Error('Archive inputs changed');
    await authorized(planned);
    return planned;
  }
  async function execute(input: ArchiveOperation) {
    // Parse/copy before any await; a mutable caller object cannot alter a checked request in flight.
    const requested = archiveOperationSchema.parse(input);
    const binding = await bindingFor(requested.binding.change, requested.binding.date);
    if (JSON.stringify(binding) !== JSON.stringify(requested.binding)) throw new Error('Archive binding mismatch');
    await readContext(binding);
    const root = resolve(binding.repositoryRoot, binding.specRoot);
    return executeArchive(join(root, binding.change), binding.date, async (plan) => {
      const current = operation(binding, await captureInputs(root), plan);
      if (encodeArchiveOperation(current) !== encodeArchiveOperation(requested))
        throw new Error('Archive operation or inputs changed');
      await authorized(current);
      // The authority may await external services: detect changes made during that interval, before staging.
      await checkTree(root);
      if (JSON.stringify(await captureInputs(root)) !== JSON.stringify(current.inputs))
        throw new Error('Archive inputs changed');
    });
  }
  return Object.freeze({ prepare, execute });
}
