import { describe, expect, it } from 'vitest';
import { coreServices } from './core-services.js';
import { createBackendModule, createBackendPlugin, createExtensionPoint } from './features.js';
import { createServiceFactory, createServiceRef } from './services.js';

describe('backend plugin API', () => {
  it('creates plugin-scoped service references by default and root ones on request', () => {
    expect(createServiceRef<string>({ id: 'x.a' })).toMatchObject({ id: 'x.a', scope: 'plugin' });
    expect(createServiceRef<string>({ id: 'x.b', scope: 'root' })).toMatchObject({ id: 'x.b', scope: 'root' });
    expect(() => createServiceRef<string>({ id: 'x.c' }).T).toThrow(/type carrier/);
    expect(() => createExtensionPoint<string>({ id: 'x.point' }).T).toThrow(/type carrier/);
  });

  it('declares every core service of D-4 with its scope', () => {
    expect(coreServices.rootConfig.scope).toBe('root');
    expect(coreServices.rootLogger.scope).toBe('root');
    for (const name of [
      'logger',
      'database',
      'httpRouter',
      'secrets',
      'telemetry',
      'fileStorage',
      'dataRef',
      'auth',
      'audit',
      'events',
      'outbound',
    ] as const) {
      expect(coreServices[name].scope, name).toBe('plugin');
      expect(coreServices[name].id).toBe(`core.${name}`);
    }
  });

  it('wraps factories and passes the plugin context through', async () => {
    const ref = createServiceRef<string>({ id: 'x.greeting' });
    const factory = createServiceFactory({
      service: ref,
      deps: { config: coreServices.rootConfig },
      factory: (_deps, { pluginId }) => `hello ${pluginId ?? ''}`,
    });
    expect(factory.service).toBe(ref);
    expect(Object.keys(factory.deps)).toEqual(['config']);
    expect(await factory.factory({ config: {} }, { pluginId: 'work' })).toBe('hello work');
  });

  it('validates plugin and module identifiers', () => {
    expect(createBackendPlugin({ pluginId: 'work-items', register: () => undefined }).kind).toBe('plugin');
    expect(createBackendModule({ pluginId: 'work', moduleId: 'github', register: () => undefined }).kind).toBe(
      'module',
    );
    expect(() => createBackendPlugin({ pluginId: 'Work', register: () => undefined })).toThrow(/Invalid pluginId/);
    expect(() => createBackendModule({ pluginId: 'work', moduleId: '1x', register: () => undefined })).toThrow(
      /Invalid moduleId/,
    );
  });
});
