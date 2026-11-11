/** Plugin identifier of environment; also its database schema and route prefix (tech plan 2.1). */
export const ENVIRONMENT_PLUGIN_ID = 'environment';

/** Status reported by the environment plugin at /api/environment/v1/status. */
export interface EnvironmentStatus {
  plugin: typeof ENVIRONMENT_PLUGIN_ID;
  status: 'ok';
}
