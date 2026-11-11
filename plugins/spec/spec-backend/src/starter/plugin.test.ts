import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { specPlugin } from './plugin.js';

describe('spec plugin', () => {
  it('serves its status under /api/spec/v1', async () => {
    const backend = await startTestBackend({ features: [specPlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/spec/v1/status' });
      expect(response.json()).toEqual({ plugin: 'spec', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
