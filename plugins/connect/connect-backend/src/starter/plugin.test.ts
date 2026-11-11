import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { connectPlugin } from './plugin.js';

describe('connect plugin', () => {
  it('serves its status under /api/connect/v1', async () => {
    const backend = await startTestBackend({ features: [connectPlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/connect/v1/status' });
      expect(response.json()).toEqual({ plugin: 'connect', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
