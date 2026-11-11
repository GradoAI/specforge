import type { ConnectStatusDto } from '../common/index.js';

/** Health of the connect plugin, returned by GET /api/connect/v1/status. */
export function getStatus(): ConnectStatusDto {
  return { plugin: 'connect', status: 'ok' };
}
