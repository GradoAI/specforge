import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { governancePlugin } from './plugin.js';

describe('governance plugin', () => {
  it('serves its status under /api/governance/v1', async () => {
    const backend = await startTestBackend({ features: [governancePlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/governance/v1/status' });
      expect(response.json()).toEqual({ plugin: 'governance', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
