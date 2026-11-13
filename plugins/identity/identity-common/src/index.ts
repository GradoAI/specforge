/** Plugin identifier of identity; also its database schema and route prefix (tech plan 2.1). */
export const IDENTITY_PLUGIN_ID = 'identity';

/** Status reported by the identity plugin at /api/identity/v1/status. */
export interface IdentityStatus {
  plugin: typeof IDENTITY_PLUGIN_ID;
  status: 'ok';
}
export * from './control-plane.js';
export * from './identity.js';
