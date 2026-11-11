import { isFasrunError } from '@fasrun/contracts-core';
import type { Logger } from 'pino';
import type { Backend } from './backend.js';

/**
 * Starts a backend for a host process. On failure it logs the error code and details and sets a non-zero
 * exit code, so the host exits unsuccessfully (R-platform-005.S2).
 */
export async function runBackend(backend: Backend, logger: Logger): Promise<boolean> {
  try {
    await backend.start();
    return true;
  } catch (error) {
    const fields = isFasrunError(error) ? { code: error.code, ...error.details } : { err: error };
    logger.fatal(fields, error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return false;
  }
}
