import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { insightPlugin } from './plugin.js';

describe('insight plugin', () => {
  it('serves its status under /api/insight/v1', async () => {
    const backend = await startTestBackend({ features: [insightPlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/insight/v1/status' });
      expect(response.json()).toEqual({ plugin: 'insight', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
