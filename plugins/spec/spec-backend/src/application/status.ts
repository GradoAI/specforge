import type { SpecStatusDto } from '../common/index.js';

/** Health of the spec plugin, returned by GET /api/spec/v1/status. */
export function getStatus(): SpecStatusDto {
  return { plugin: 'spec', status: 'ok' };
}
