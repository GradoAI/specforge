import type { EntryStatusDto } from '../common/index.js';

/** Health of the entry plugin, returned by GET /api/entry/v1/status. */
export function getStatus(): EntryStatusDto {
  return { plugin: 'entry', status: 'ok' };
}
