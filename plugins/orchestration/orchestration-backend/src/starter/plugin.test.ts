import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { orchestrationPlugin } from './plugin.js';

describe('orchestration plugin', () => {
  it('serves its status under /api/orchestration/v1', async () => {
    const backend = await startTestBackend({ features: [orchestrationPlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/orchestration/v1/status' });
      expect(response.json()).toEqual({ plugin: 'orchestration', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
