/** Plugin identifier of governance; also its database schema and route prefix (tech plan 2.1). */
export const GOVERNANCE_PLUGIN_ID = 'governance';

/** Status reported by the governance plugin at /api/governance/v1/status. */
export interface GovernanceStatus {
  plugin: typeof GOVERNANCE_PLUGIN_ID;
  status: 'ok';
}
