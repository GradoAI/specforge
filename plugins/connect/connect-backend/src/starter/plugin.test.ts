import { startTestBackend } from '@fasrun/test-utils';
import { describe, expect, it } from 'vitest';
import { createBackendModule } from '@fasrun/backend-plugin-api';
import { connectAdapters, type ConnectAdapter } from '@fasrun/plugin-connect-node';
import { createConnectAdapters } from './adapters.js';
import { createConnectPlugin, connectPlugin } from './plugin.js';

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

it('TC-SF5-CONNECT-008 exposes the gateway adapter registry to backend modules and rejects replacement', async () => {
  const adapters = createConnectAdapters();
  const adapter: ConnectAdapter = {
    provider: 'github',
    performAction: () => Promise.reject(new Error('Not dispatched by registration')),
    queryAction: () => Promise.reject(new Error('Not queried by registration')),
  };
  const module = createBackendModule({
    pluginId: 'connect',
    moduleId: 'fixture',
    register(env) {
      env.registerInit({
        deps: { registry: connectAdapters },
        init({ registry }) {
          registry.register(adapter);
        },
      });
    },
  });
  expect(() => adapters.get('github')).toThrow('unavailable');
  const backend = await startTestBackend({ features: [createConnectPlugin(adapters), module] });
  try {
    expect(adapters.get('github')).toBe(adapter);
    expect(() => adapters.register(adapter)).toThrow('Duplicate');
    expect(() => adapters.register({ ...adapter, provider: '' })).toThrow('invalid');
  } finally {
    await backend.stop();
  }
});
