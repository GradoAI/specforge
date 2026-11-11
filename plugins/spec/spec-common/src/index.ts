/** Plugin identifier of spec; also its database schema and route prefix (tech plan 2.1). */
export const SPEC_PLUGIN_ID = 'spec';

/** Status reported by the spec plugin at /api/spec/v1/status. */
export interface SpecStatus {
  plugin: typeof SPEC_PLUGIN_ID;
  status: 'ok';
}
