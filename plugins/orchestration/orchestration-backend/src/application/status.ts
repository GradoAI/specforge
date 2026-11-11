import type { OrchestrationStatusDto } from '../common/index.js';

/** Health of the orchestration plugin, returned by GET /api/orchestration/v1/status. */
export function getStatus(): OrchestrationStatusDto {
  return { plugin: 'orchestration', status: 'ok' };
}
