import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, realpath, lstat, open, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorageService } from '@fasrun/backend-plugin-api';

export function contentDigest(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
/** Dedicated private PV directory. No overwrite/delete API; orphan retention belongs to the operator. */
export async function createContentAddressedStorage(directory: string): Promise<FileStorageService> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Invalid content storage directory');
  const root = await realpath(directory);
  function file(key: string): string {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid content address');
    return path.join(root, key);
  }
  async function get(key: string): Promise<Uint8Array | undefined> {
    const target = file(key);
    try {
      const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await handle.stat()).isFile()) throw new Error('Invalid content object');
        const data = await handle.readFile();
        if (contentDigest(data) !== key) throw new Error('Content integrity failure');
        return data;
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined;
      // Storage paths and underlying errors must not enter public errors/logs.
      // eslint-disable-next-line preserve-caught-error -- Raw filesystem errors may contain private storage paths.
      throw new Error('Content unavailable');
    }
  }
  return {
    get,
    async put(key, input) {
      const target = file(key),
        data = Uint8Array.from(input);
      if (contentDigest(data) !== key) throw new Error('Content address mismatch');
      const temp = path.join(root, `.pending-${randomUUID()}`);
      try {
        const handle = await open(temp, 'wx', 0o600);
        try {
          await handle.writeFile(data);
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          // Hard-link publication is atomic and never replaces a concurrently published object.
          await link(temp, target);
        } catch (error) {
          if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error;
        }
        if (!(await get(key))) throw new Error('Content publication failure');
        const directoryHandle = await open(root, constants.O_RDONLY);
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      } catch {
        throw new Error('Content publication failure');
      } finally {
        await unlink(temp).catch(() => undefined);
      }
    },
  };
}
