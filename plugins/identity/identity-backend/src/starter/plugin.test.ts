import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { identityPlugin } from './plugin.js';

describe('identity plugin', () => {
  it('serves its status under /api/identity/v1', async () => {
    const backend = await startTestBackend({ features: [identityPlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/identity/v1/status' });
      expect(response.json()).toEqual({ plugin: 'identity', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
