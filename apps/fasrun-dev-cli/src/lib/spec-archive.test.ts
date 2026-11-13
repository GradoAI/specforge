import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { runSpecArchive } from './spec-archive.js';

vi.mock('node:fs/promises', async (importOriginal) => ({ ...(await importOriginal<typeof fs>()) }));
vi.setConfig({ testTimeout: 30_000 });
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
const entry = (n: number, title: string) =>
  `### Requirement: R-demo-00${n} ${title}\nDescription\n#### Scenario: R-demo-00${n}.S1 Works\n- GIVEN input\n- WHEN applied\n- THEN done\n`;
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'fasrun-archive-'));
  dirs.push(root);
  const files: Record<string, string> = {
    'specs/demo/spec.md': `# Demo\n## Requirements\n${entry(1, 'Old')}${entry(2, 'Removed')}${entry(3, 'Old')}`,
    'changes/demo/specs/demo/spec.md': `## ADDED Requirements\n${entry(4, 'Added')}\n## MODIFIED Requirements\n${entry(1, 'Modified')}\n## REMOVED Requirements\n### Requirement: R-demo-002 Removed\n原因：old\n迁移：none\n## RENAMED Requirements\n- FROM: R-demo-003 Old\n- TO: R-demo-003 New\n`,
    'changes/demo/notes.txt': 'Retain non-Markdown artifacts\n',
  };
  for (const [file, text] of Object.entries(files)) {
    await fs.mkdir(dirname(join(root, file)), { recursive: true });
    await fs.writeFile(join(root, file), text);
  }
  return { root, files };
}
async function snapshot(root: string, binary = false): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(path: string) {
    for (const item of await fs.readdir(join(root, path), { withFileTypes: true })) {
      const file = path ? `${path}/${item.name}` : item.name;
      if (item.isDirectory()) {
        result[`${file}/`] = '';
        await walk(file);
      } else if (item.isSymbolicLink()) result[file] = `symlink:${await fs.readlink(join(root, file))}`;
      else result[file] = (await fs.readFile(join(root, file))).toString(binary ? 'base64' : 'utf8');
    }
  }
  await walk('');
  return result;
}
const bin = fileURLToPath(new URL('../../bin/run.js', import.meta.url));
function cli(args: string[]) {
  return spawnSync(process.execPath, [bin, ...args, '--json'], { encoding: 'utf8', timeout: 20_000 });
}

it('TC-SPEC-013 actual CLI archives all operations, preserves artifacts, then validates', async () => {
  const { root } = await fixture();
  const result = cli(['spec', 'archive', join(root, 'changes/demo'), '--date', '2026-11-12']);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, result: { updated: ['specs/demo/spec.md'] } });
  const tree = await snapshot(root);
  const current = tree['specs/demo/spec.md']!;
  expect(current).toContain('R-demo-001 Modified');
  expect(current).not.toContain('R-demo-002');
  expect(current).toContain('R-demo-003 New');
  expect(current).toContain('R-demo-003.S1 Works');
  expect(current).toContain('R-demo-004 Added');
  expect(tree['changes/archive/2026-11-12-demo/notes.txt']).toContain('Retain');
  expect(tree['changes/demo/']).toBeUndefined();
  expect(cli(['spec', 'validate', root]).status).toBe(0);
});
it('TC-SPEC-013 defaults to the UTC date', async () => {
  const { root } = await fixture();
  const dates = [new Date().toISOString().slice(0, 10)];
  const result = await runSpecArchive(join(root, 'changes/demo'));
  dates.push(new Date().toISOString().slice(0, 10));
  expect(dates.some((date) => result.archived.endsWith(`${date}-demo`))).toBe(true);
});
it('TC-SPEC-014 actual CLI rejects conflicts, invalid dates and invalid source without any filesystem changes', async () => {
  const { root } = await fixture();
  await fs.writeFile(join(root, 'changes/demo/specs/demo/spec.md'), `## ADDED Requirements\n${entry(1, 'Duplicate')}`);
  const before = await snapshot(root);
  for (const args of [
    ['spec', 'archive', join(root, 'changes/demo')],
    ['spec', 'archive', join(root, 'changes/demo'), '--date', '2026-02-30'],
    ['spec', 'archive', join(root, 'changes/archive')],
  ]) {
    const result = cli(args);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: 'FASRUN_CHECK_FAILED' } });
    expect(await snapshot(root)).toEqual(before);
  }
});
it('TC-SPEC-014 refuses unsupported current sections without losing auxiliary content', async () => {
  const { root } = await fixture();
  await fs.appendFile(join(root, 'specs/demo/spec.md'), '\n## Notes\nImportant auxiliary content.\n');
  const before = await snapshot(root);
  const result = cli(['spec', 'archive', join(root, 'changes/demo')]);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('Unsupported current spec heading');
  expect(await snapshot(root)).toEqual(before);
});
it('TC-SPEC-014 rejects an existing empty archive target and symlinked inputs', async () => {
  const { root } = await fixture();
  await fs.mkdir(join(root, 'changes/archive/2026-11-12-demo'), { recursive: true });
  const before = await snapshot(root);
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Archive exists');
  expect(await snapshot(root)).toEqual(before);
  await fs.symlink(join(root, 'specs/demo/spec.md'), join(root, 'link.md'));
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Symlink');
  expect(await fs.readlink(join(root, 'link.md'))).toBe(join(root, 'specs/demo/spec.md'));
});
it.each([1, 2, 3, 4, 5])('TC-SPEC-014 rolls back an injected rename failure at step %i', async (step) => {
  const { root } = await fixture();
  await fs.mkdir(join(root, 'specs/other'));
  await fs.mkdir(join(root, 'changes/demo/specs/other'));
  await fs.writeFile(join(root, 'specs/other/spec.md'), '# Other\n## Requirements\n');
  await fs.writeFile(
    join(root, 'changes/demo/specs/other/spec.md'),
    `## ADDED Requirements\n${entry(5, 'Second file')}`,
  );
  const before = await snapshot(root);
  const original = fs.rename;
  let count = 0;
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (++count === step) throw new Error('Injected rename failure');
    return original(from, to);
  });
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Injected');
  expect(await snapshot(root)).toEqual(before);
});
it('TC-SPEC-014 temporary write failure leaves the source tree intact', async () => {
  const { root } = await fixture();
  const before = await snapshot(root);
  vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Injected write failure'));
  await expect(runSpecArchive(join(root, 'changes/demo'), '2026-11-12')).rejects.toThrow('Injected');
  expect(await snapshot(root)).toEqual(before);
});

// These are trusted port fixtures, not identity/Keycloak integration evidence.
async function controlled() {
  const { root, files } = await fixture();
  const repository = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'fasrun-archive-repo-')));
  dirs.push(repository);
  await fs.rename(root, join(repository, 'fasrun'));
  const context = {
    actor: {
      version: 1 as const,
      actorId: 'member',
      actorKind: 'member' as const,
      orgId: 'org',
      clientId: 'control',
      source: 'internal' as const,
      traceId: 'trace',
      authorizationId: 'auth',
    },
    permission: 'spec.write',
    scope: { orgId: 'org', projectId: 'project' },
    object: { type: 'repository', id: 'repository' },
  };
  const authority = {
    resolveContext: vi.fn<ArchiveAuthority['resolveContext']>(() => Promise.resolve(structuredClone(context))),
    authorize: vi.fn<ArchiveAuthority['authorize']>((actor, _operation, operationDigest) =>
      Promise.resolve({ authorizationId: 'auth', context: actor, operationDigest }),
    ),
  } satisfies ArchiveAuthority;
  const facade = createAuthorizedSpecArchiver({
    repositoryId: 'repository',
    repositoryRoot: repository,
    specRoot: 'fasrun',
    authority,
  });
  return { root: join(repository, 'fasrun'), repository, files, context, authority, facade };
}
import { createAuthorizedSpecArchiver } from './spec-archive.js';
import type { ArchiveAuthority } from '@fasrun/plugin-spec-common';

it('TC-SF5-SPEC-009 controlled M1 facade uses the real writer with exact attachment bytes and only authorized actions', async () => {
  const f = await controlled();
  await fs.writeFile(join(f.root, 'changes/demo/attachment.bin'), Buffer.from([0, 255, 128, 1]));
  await fs.mkdir(join(f.root, 'changes/demo/empty'));
  const operation = await f.facade.prepare('changes/demo', '2026-11-12');
  expect(operation.inputs).toContainEqual({ kind: 'file', path: 'changes/demo/attachment.bin', bytes: 'AP+AAQ==' });
  expect(Object.keys(f.facade)).toEqual(['prepare', 'execute']);
  expect(await f.facade.execute(operation)).toMatchObject({ updated: ['specs/demo/spec.md'] });
  expect(await fs.readFile(join(f.root, 'changes/archive/2026-11-12-demo/attachment.bin'))).toEqual(
    Buffer.from([0, 255, 128, 1]),
  );
  expect((await fs.stat(join(f.root, 'changes/archive/2026-11-12-demo/empty'))).isDirectory()).toBe(true);
  expect((await snapshot(f.root))['specs/demo/spec.md']).toContain('Modified');
});

it.each([
  'content',
  'extra-write',
  'missing-write',
  'extra-move',
  'move-target',
  'move-source',
  'date',
  'repository',
  'root',
  'change',
  'snapshot',
] as const)('TC-SF5-SPEC-009 rejects %s request tampering without any write or temporary residue', async (kind) => {
  const f = await controlled();
  const operation = await f.facade.prepare('changes/demo', '2026-11-12');
  const before = await snapshot(f.root, true);
  const write = operation.actions.find((a) => a.kind === 'write')!;
  const move = operation.actions.find((a) => a.kind === 'move')!;
  if (kind === 'content') write.text += '\nUnauthorised additional text';
  if (kind === 'extra-write') operation.actions.push({ ...write });
  if (kind === 'missing-write') operation.actions = operation.actions.filter((a) => a.kind !== 'write');
  if (kind === 'extra-move') operation.actions.push({ ...move });
  if (kind === 'move-target') move.to = 'changes/archive/other';
  if (kind === 'move-source') move.from = 'changes/other';
  if (kind === 'date') operation.binding.date = '2026-11-13';
  if (kind === 'repository') operation.binding.repositoryId = 'other';
  if (kind === 'root') operation.binding.specRoot = 'other';
  if (kind === 'change') operation.binding.change = 'changes/other';
  if (kind === 'snapshot') operation.inputs = operation.inputs.slice(1);
  await expect(f.facade.execute(operation)).rejects.toThrow();
  expect(await snapshot(f.root, true)).toEqual(before);
});

it.each(['markdown', 'attachment', 'binary', 'directory'] as const)(
  'TC-SF5-SPEC-009 refuses a stale %s snapshot before staging',
  async (kind) => {
    const f = await controlled();
    await fs.writeFile(join(f.root, 'changes/demo/binary.bin'), Buffer.from([255]));
    const op = await f.facade.prepare('changes/demo', '2026-11-12');
    if (kind === 'markdown') await fs.appendFile(join(f.root, 'specs/demo/spec.md'), '\nChanged');
    if (kind === 'attachment') await fs.appendFile(join(f.root, 'changes/demo/notes.txt'), 'changed');
    if (kind === 'binary') await fs.writeFile(join(f.root, 'changes/demo/binary.bin'), Buffer.from([254]));
    if (kind === 'directory') await fs.mkdir(join(f.root, 'changes/demo/new-empty'));
    const before = await snapshot(f.root, true);
    await expect(f.facade.execute(op)).rejects.toThrow();
    expect(await snapshot(f.root, true)).toEqual(before);
  },
);

it.each(['missing', 'boolean', 'digest', 'actor', 'authorization', 'revoked', 'system', 'read-denied'] as const)(
  'TC-SF5-SPEC-009 refuses %s authority and never falls back to M0',
  async (kind) => {
    const f = await controlled();
    const op = await f.facade.prepare('changes/demo', '2026-11-12');
    const before = await snapshot(f.root, true);
    if (kind === 'missing') vi.mocked(f.authority.authorize).mockResolvedValue(undefined);
    if (kind === 'boolean') vi.mocked(f.authority.authorize).mockResolvedValue(true as never);
    if (kind === 'digest')
      vi.mocked(f.authority.authorize).mockImplementation((ctx) =>
        Promise.resolve({ authorizationId: 'auth', context: ctx, operationDigest: '0'.repeat(64) }),
      );
    if (kind === 'actor')
      vi.mocked(f.authority.authorize).mockImplementation((ctx, _op, hash) =>
        Promise.resolve({
          authorizationId: 'auth',
          context: { ...ctx, actor: { ...ctx.actor, actorId: 'other' } },
          operationDigest: hash,
        }),
      );
    if (kind === 'authorization')
      vi.mocked(f.authority.authorize).mockImplementation((ctx, _op, hash) =>
        Promise.resolve({ authorizationId: 'other', context: ctx, operationDigest: hash }),
      );
    if (kind === 'revoked') vi.mocked(f.authority.authorize).mockRejectedValue(new Error('Revoked'));
    if (kind === 'system')
      vi.mocked(f.authority.resolveContext).mockResolvedValue({
        ...f.context,
        actor: { ...f.context.actor, actorKind: 'system' },
      } as never);
    if (kind === 'read-denied') vi.mocked(f.authority.resolveContext).mockRejectedValue(new Error('Read denied'));
    await expect(f.facade.execute(op)).rejects.toThrow();
    expect(await snapshot(f.root, true)).toEqual(before);
    if (kind === 'read-denied') {
      const spy = vi.spyOn(fs, 'readFile');
      await expect(f.facade.prepare('changes/demo', '2026-11-12')).rejects.toThrow('read authorization denied');
      expect(spy).not.toHaveBeenCalled();
    }
  },
);

it('TC-SF5-SPEC-009 checks the snapshot again after awaiting current authorization', async () => {
  const f = await controlled();
  const op = await f.facade.prepare('changes/demo', '2026-11-12');
  vi.mocked(f.authority.authorize).mockImplementation(async (context, _op, operationDigest) => {
    await fs.appendFile(join(f.root, 'changes/demo/notes.txt'), 'external edit');
    return { authorizationId: 'auth', context, operationDigest };
  });
  await expect(f.facade.execute(op)).rejects.toThrow('inputs changed');
  const tree = await snapshot(f.root);
  expect(tree['changes/demo/notes.txt']).toContain('external edit');
  expect(tree['specs/demo/spec.md']).toEqual(f.files['specs/demo/spec.md']);
  expect(Object.keys(tree).some((p) => p.startsWith('.archive-'))).toBe(false);
});

it.each(['write', 'rename-1', 'rename-2', 'rename-3'] as const)(
  'TC-SF5-SPEC-009 real controlled writer rolls back %s failure',
  async (kind) => {
    const f = await controlled();
    const op = await f.facade.prepare('changes/demo', '2026-11-12');
    const before = await snapshot(f.root, true);
    if (kind === 'write') vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Injected write failure'));
    else {
      const original = fs.rename;
      let count = 0;
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        if (++count === Number(kind.slice(-1))) throw new Error('Injected rename failure');
        return original(from, to);
      });
    }
    await expect(f.facade.execute(op)).rejects.toThrow('Injected');
    expect(await snapshot(f.root, true)).toEqual(before);
  },
);

it('TC-SF5-SPEC-009 retains original conflict, existing-target and symlink preflight', async () => {
  const f = await controlled();
  const op = await f.facade.prepare('changes/demo', '2026-11-12');
  await fs.mkdir(join(f.root, 'changes/archive/2026-11-12-demo'), { recursive: true });
  const before = await snapshot(f.root, true);
  await expect(f.facade.execute(op)).rejects.toThrow('Archive exists');
  expect(await snapshot(f.root, true)).toEqual(before);
  await fs.rm(join(f.root, 'changes/archive'), { recursive: true });
  await fs.symlink(join(f.root, 'specs/demo/spec.md'), join(f.root, 'symlink.md'));
  await expect(f.facade.execute(op)).rejects.toThrow('Symlink');
  await fs.unlink(join(f.root, 'symlink.md'));
  await fs.writeFile(
    join(f.root, 'changes/demo/specs/demo/spec.md'),
    `## ADDED Requirements\n${entry(1, 'Duplicate')}`,
  );
  const conflicting = await snapshot(f.root, true);
  await expect(f.facade.execute(op)).rejects.toThrow();
  expect(await snapshot(f.root, true)).toEqual(conflicting);
});
