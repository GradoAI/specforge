/** Plugin identifier of knowledge; also its database schema and route prefix (tech plan 2.1). */
export const KNOWLEDGE_PLUGIN_ID = 'knowledge';

/** Status reported by the knowledge plugin at /api/knowledge/v1/status. */
export interface KnowledgeStatus {
  plugin: typeof KNOWLEDGE_PLUGIN_ID;
  status: 'ok';
}
export * from './control-plane.js';
