import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readdir, readFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isId } from '@fasrun/contracts-core';
import type { AuditCheckpoint } from '@fasrun/plugin-governance-common';
import type { AuditCheckpointStore } from '@fasrun/plugin-governance-node';

/** Independently retained immutable chain heads. Mount this directory outside the audit database.
 * This detects database truncation, not compromise of both the database and this independent store.
 */
export function createFileCheckpointStore(directory: string): AuditCheckpointStore {
  const root = resolve(directory);
  async function syncDirectory(path: string) {
    const handle = await open(path, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  function folder(orgId: string) {
    if (!isId('org', orgId)) throw new Error('Invalid checkpoint organization');
    return join(root, orgId);
  }
  function validate(value: unknown, orgId: string): AuditCheckpoint {
    if (!value || typeof value !== 'object') throw new Error('Invalid external checkpoint');
    const data = value as Partial<AuditCheckpoint>;
    if (
      data.orgId !== orgId ||
      !Number.isSafeInteger(data.sequence) ||
      data.sequence! < 1 ||
      typeof data.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.hash)
    )
      throw new Error('Invalid external checkpoint');
    return { orgId, sequence: data.sequence!, hash: data.hash };
  }
  const same = (a: AuditCheckpoint, b: AuditCheckpoint) =>
    a.orgId === b.orgId && a.sequence === b.sequence && a.hash === b.hash;
  async function load(orgId: string): Promise<AuditCheckpoint | undefined> {
    const path = folder(orgId);
    let names: string[];
    try {
      names = await readdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    let head: AuditCheckpoint | undefined;
    for (const name of names) {
      // Incomplete writes remain unpublished temporary files, never candidate chain heads.
      if (name.startsWith('.pending-')) continue;
      if (!/^[1-9][0-9]*\.json$/.test(name)) throw new Error('Unexpected external checkpoint file');
      const value = validate(JSON.parse(await readFile(join(path, name), 'utf8')), orgId);
      if (`${value.sequence}.json` !== name) throw new Error('External checkpoint filename mismatch');
      if (!head || value.sequence > head.sequence) head = value;
    }
    return head;
  }
  return {
    load,
    async publish(input) {
      const checkpoint = validate(input, input.orgId);
      const path = folder(checkpoint.orgId);
      // The separately mounted root must already exist; never silently recreate lost retention storage.
      try {
        await mkdir(path, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      await syncDirectory(root);
      const destination = join(path, `${checkpoint.sequence}.json`);
      const head = await load(checkpoint.orgId);
      if (head && head.sequence >= checkpoint.sequence) {
        try {
          const existing = validate(JSON.parse(await readFile(destination, 'utf8')), checkpoint.orgId);
          if (!same(existing, checkpoint)) throw new Error('External checkpoint conflicts with retained evidence');
          // A previous writer may have stopped after link but before directory fsync.
          await syncDirectory(path);
          return;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          // Commits can publish out of order. Retain the missing older evidence without lowering the head.
        }
      }
      const temporary = join(path, `.pending-${randomUUID()}`);
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(checkpoint) + '\n');
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        // Atomic no-replace publication: concurrent writers cannot replace an existing sequence.
        try {
          await link(temporary, destination);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const existing = validate(JSON.parse(await readFile(destination, 'utf8')), checkpoint.orgId);
          if (!same(existing, checkpoint))
            throw new Error('External checkpoint conflicts with retained evidence', { cause: error });
        }
        await syncDirectory(path);
      } finally {
        await unlink(temporary);
      }
    },
  };
}
