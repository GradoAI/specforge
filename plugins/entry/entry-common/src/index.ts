/** Plugin identifier of entry; also its database schema and route prefix (tech plan 2.1). */
export const ENTRY_PLUGIN_ID = 'entry';

/** Status reported by the entry plugin at /api/entry/v1/status. */
export interface EntryStatus {
  plugin: typeof ENTRY_PLUGIN_ID;
  status: 'ok';
}
export * from './control-plane.js';
