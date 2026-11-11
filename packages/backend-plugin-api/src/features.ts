import type { AnyServiceRef, ResolvedDeps } from './services.js';

/** An extension point a plugin offers to its modules. */
export interface ExtensionPoint<T> {
  readonly $$type: '@fasrun/ExtensionPoint';
  readonly id: string;
  /** Type carrier only; reading it throws. */
  readonly T: T;
}

export function createExtensionPoint<T>(options: { id: string }): ExtensionPoint<T> {
  const { id } = options;
  return {
    $$type: '@fasrun/ExtensionPoint',
    id,
    get T(): T {
      throw new Error(`ExtensionPoint.T of ${id} is a type carrier and has no value`);
    },
    toString: () => `extensionPoint{${id}}`,
  } as ExtensionPoint<T>;
}

export interface InitRegistration<TDeps> {
  deps: TDeps;
  init(deps: ResolvedDeps<TDeps>): void | Promise<void>;
}

export interface PluginRegistrationPoints {
  /** Declares the services the plugin needs; `init` runs once they are available. */
  registerInit<TDeps extends Record<string, AnyServiceRef>>(registration: InitRegistration<TDeps>): void;
  registerExtensionPoint<T>(extensionPoint: ExtensionPoint<T>, implementation: T): void;
}

export interface ModuleRegistrationPoints {
  /** Modules may also depend on the extension points of their plugin. */
  registerInit<TDeps extends Record<string, AnyServiceRef | ExtensionPoint<unknown>>>(
    registration: InitRegistration<TDeps>,
  ): void;
}

export interface BackendPlugin {
  readonly $$type: '@fasrun/BackendFeature';
  readonly kind: 'plugin';
  readonly pluginId: string;
  register(env: PluginRegistrationPoints): void;
}

export interface BackendModule {
  readonly $$type: '@fasrun/BackendFeature';
  readonly kind: 'module';
  readonly pluginId: string;
  readonly moduleId: string;
  register(env: ModuleRegistrationPoints): void;
}

export type BackendFeature = BackendPlugin | BackendModule;

/** Plugin identifiers double as database schema and route names (tech plan 2.1). */
export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function assertId(kind: string, id: string): void {
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${kind} "${id}": use lowercase letters, digits and hyphens, starting with a letter`);
  }
}

export function createBackendPlugin(options: {
  pluginId: string;
  register(env: PluginRegistrationPoints): void;
}): BackendPlugin {
  assertId('pluginId', options.pluginId);
  return {
    $$type: '@fasrun/BackendFeature',
    kind: 'plugin',
    pluginId: options.pluginId,
    register: (env) => options.register(env),
  };
}

export function createBackendModule(options: {
  pluginId: string;
  moduleId: string;
  register(env: ModuleRegistrationPoints): void;
}): BackendModule {
  assertId('pluginId', options.pluginId);
  assertId('moduleId', options.moduleId);
  return {
    $$type: '@fasrun/BackendFeature',
    kind: 'module',
    pluginId: options.pluginId,
    moduleId: options.moduleId,
    register: (env) => options.register(env),
  };
}
