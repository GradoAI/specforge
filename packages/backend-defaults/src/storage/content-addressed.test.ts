import { mkdtemp, rm, readFile, readdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { createContentAddressedStorage, contentDigest } from './content-addressed.js';
it('TC-CF-014 publishes immutable content atomically, rejects wrong hashes and unsafe paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'data-store-'));
  try {
    const storage = await createContentAddressedStorage(root),
      bytes = new TextEncoder().encode('immutable'),
      key = contentDigest(bytes);
    await Promise.all(Array.from({ length: 8 }, () => storage.put(key, bytes)));
    expect(await readFile(path.join(root, key), 'utf8')).toBe('immutable');
    expect(new TextDecoder().decode(await storage.get(key))).toBe('immutable');
    expect(await readdir(root)).toEqual([key]);
    await expect(storage.put(key, new Uint8Array([0]))).rejects.toThrow('mismatch');
    await expect(storage.get('../outside')).rejects.toThrow('Invalid');
    expect(await storage.get('f'.repeat(64))).toBeUndefined();
    await writeFile(path.join(root, key), 'tampered');
    await expect(storage.get(key)).rejects.toThrow('Content unavailable');
    await expect(storage.put(key, bytes)).rejects.toThrow('publication failure');
    expect(await readdir(root)).toEqual([key]);
    await rm(path.join(root, key));
    await symlink('/etc/passwd', path.join(root, key));
    await expect(storage.get(key)).rejects.toThrow('Content unavailable');
    await expect(storage.put(key, bytes)).rejects.toThrow('publication failure');
    const alias = `${root}-link`;
    await symlink(root, alias);
    try {
      await expect(createContentAddressedStorage(alias)).rejects.toThrow('Invalid');
    } finally {
      await rm(alias);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
