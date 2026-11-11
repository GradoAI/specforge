import type { GovernanceStatusDto } from '../common/index.js';

/** Health of the governance plugin, returned by GET /api/governance/v1/status. */
export function getStatus(): GovernanceStatusDto {
  return { plugin: 'governance', status: 'ok' };
}
