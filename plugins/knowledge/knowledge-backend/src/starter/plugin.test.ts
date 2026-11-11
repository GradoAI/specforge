import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { knowledgePlugin } from './plugin.js';

describe('knowledge plugin', () => {
  it('serves its status under /api/knowledge/v1', async () => {
    const backend = await startTestBackend({ features: [knowledgePlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/knowledge/v1/status' });
      expect(response.json()).toEqual({ plugin: 'knowledge', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
