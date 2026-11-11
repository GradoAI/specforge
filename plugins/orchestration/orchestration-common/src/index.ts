/** Plugin identifier of orchestration; also its database schema and route prefix (tech plan 2.1). */
export const ORCHESTRATION_PLUGIN_ID = 'orchestration';

/** Status reported by the orchestration plugin at /api/orchestration/v1/status. */
export interface OrchestrationStatus {
  plugin: typeof ORCHESTRATION_PLUGIN_ID;
  status: 'ok';
}
