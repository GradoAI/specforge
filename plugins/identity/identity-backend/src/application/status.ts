import type { IdentityStatusDto } from '../common/index.js';

/** Health of the identity plugin, returned by GET /api/identity/v1/status. */
export function getStatus(): IdentityStatusDto {
  return { plugin: 'identity', status: 'ok' };
}
