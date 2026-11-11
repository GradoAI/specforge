import type { EnvironmentStatusDto } from '../common/index.js';

/** Health of the environment plugin, returned by GET /api/environment/v1/status. */
export function getStatus(): EnvironmentStatusDto {
  return { plugin: 'environment', status: 'ok' };
}
