/** Plugin identifier of insight; also its database schema and route prefix (tech plan 2.1). */
export const INSIGHT_PLUGIN_ID = 'insight';

/** Status reported by the insight plugin at /api/insight/v1/status. */
export interface InsightStatus {
  plugin: typeof INSIGHT_PLUGIN_ID;
  status: 'ok';
}
