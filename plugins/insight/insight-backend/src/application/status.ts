import type { InsightStatusDto } from '../common/index.js';

/** Health of the insight plugin, returned by GET /api/insight/v1/status. */
export function getStatus(): InsightStatusDto {
  return { plugin: 'insight', status: 'ok' };
}
