/** Plugin identifier of connect; also its database schema and route prefix (tech plan 2.1). */
export const CONNECT_PLUGIN_ID = 'connect';

/** Status reported by the connect plugin at /api/connect/v1/status. */
export interface ConnectStatus {
  plugin: typeof CONNECT_PLUGIN_ID;
  status: 'ok';
}
