import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { environmentPlugin } from './plugin.js';

describe('environment plugin', () => {
  it('serves its status under /api/environment/v1', async () => {
    const backend = await startTestBackend({ features: [environmentPlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/environment/v1/status' });
      expect(response.json()).toEqual({ plugin: 'environment', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
