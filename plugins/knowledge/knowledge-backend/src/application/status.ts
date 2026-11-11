import type { KnowledgeStatusDto } from '../common/index.js';

/** Health of the knowledge plugin, returned by GET /api/knowledge/v1/status. */
export function getStatus(): KnowledgeStatusDto {
  return { plugin: 'knowledge', status: 'ok' };
}
