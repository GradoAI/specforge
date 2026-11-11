import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { entryPlugin } from './plugin.js';

describe('entry plugin', () => {
  it('serves its status under /api/entry/v1', async () => {
    const backend = await startTestBackend({ features: [entryPlugin] });
    try {
      const response = await backend.server.inject({ method: 'GET', url: '/api/entry/v1/status' });
      expect(response.json()).toEqual({ plugin: 'entry', status: 'ok' });
    } finally {
      await backend.stop();
    }
  });
});
