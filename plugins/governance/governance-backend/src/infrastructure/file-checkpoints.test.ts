import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '@fasrun/contracts-core';
import { createFileCheckpointStore } from './file-checkpoints.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'fasrun-chain-head-'));
  directories.push(directory);
  return { directory, store: createFileCheckpointStore(directory), orgId: newId('org') };
}
describe('TC-SF5-IDENTITY-012 independently retained audit evidence', () => {
  it('accepts delayed publication after a newer committed head without regressing it', async () => {
    const { store, orgId } = await fixture();
    const newer = { orgId, sequence: 2, hash: 'b'.repeat(64) };
    await store.publish(newer);
    await store.publish({ orgId, sequence: 1, hash: 'a'.repeat(64) });
    expect(await store.load(orgId)).toEqual(newer);
    await expect(store.publish({ orgId, sequence: 1, hash: 'c'.repeat(64) })).rejects.toThrow('conflicts');
  });
  it('retains immutable heads across adapter restarts, concurrent publication, and older retries', async () => {
    const { store, directory, orgId } = await fixture();
    expect(await store.load(orgId)).toBeUndefined();
    const first = { orgId, sequence: 1, hash: 'a'.repeat(64) };
    await Promise.all([store.publish(first), store.publish(first)]);
    const next = { orgId, sequence: 2, hash: 'b'.repeat(64) };
    await store.publish(next);
    await store.publish(first);
    expect(await createFileCheckpointStore(directory).load(orgId)).toEqual(next);
    await expect(store.publish({ ...first, hash: 'c'.repeat(64) })).rejects.toThrow('conflicts');
    expect(JSON.parse(await readFile(join(directory, orgId, '1.json'), 'utf8'))).toEqual(first);
    expect((await stat(join(directory, orgId, '1.json'))).mode & 0o777).toBe(0o600);
    expect(await store.load(newId('org'))).toBeUndefined();
  });
  it('fails closed on corrupt external evidence and invalid tenant/sequence/hash', async () => {
    const { store, directory, orgId } = await fixture();
    await expect(store.load('../outside')).rejects.toThrow();
    await expect(
      createFileCheckpointStore(join(directory, 'missing-mount')).publish({ orgId, sequence: 1, hash: 'a'.repeat(64) }),
    ).rejects.toThrow();
    await expect(store.publish({ orgId, sequence: 0, hash: 'a'.repeat(64) })).rejects.toThrow();
    await expect(store.publish({ orgId, sequence: 1, hash: 'invalid' })).rejects.toThrow();
    await store.publish({ orgId, sequence: 1, hash: 'a'.repeat(64) });
    await writeFile(join(directory, orgId, '1.json'), '{broken');
    await expect(store.load(orgId)).rejects.toThrow();
    await expect(store.publish({ orgId, sequence: 2, hash: 'b'.repeat(64) })).rejects.toThrow();
  });
});
