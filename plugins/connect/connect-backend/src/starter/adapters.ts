import type { ConnectAdapter, ConnectAdapters } from '@fasrun/plugin-connect-node';
/** Owned by the gateway composition root; modules can register but cannot replace an existing provider. */
export function createConnectAdapters(): ConnectAdapters & { get(provider: string): ConnectAdapter } {
  const adapters = new Map<string, ConnectAdapter>();
  return {
    register(adapter) {
      if (!adapter.provider || adapters.has(adapter.provider)) throw new Error('Duplicate or invalid CONNECT adapter');
      adapters.set(adapter.provider, adapter);
    },
    get(provider) {
      const value = adapters.get(provider);
      if (!value) throw new Error('CONNECT adapter unavailable');
      return value;
    },
  };
}
