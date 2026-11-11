/** `root` services exist once per backend; `plugin` services get one instance per plugin. */
export type ServiceScope = 'root' | 'plugin';

/** A typed reference to a service; the implementation is supplied by a service factory. */
export interface ServiceRef<T, TScope extends ServiceScope = ServiceScope> {
  readonly $$type: '@fasrun/ServiceRef';
  readonly id: string;
  readonly scope: TScope;
  /** Type carrier only; reading it throws. */
  readonly T: T;
}

export function createServiceRef<T>(options: { id: string; scope?: 'plugin' }): ServiceRef<T, 'plugin'>;
export function createServiceRef<T>(options: { id: string; scope: 'root' }): ServiceRef<T, 'root'>;
export function createServiceRef<T>(options: { id: string; scope?: ServiceScope }): ServiceRef<T> {
  const { id, scope = 'plugin' } = options;
  return {
    $$type: '@fasrun/ServiceRef',
    id,
    scope,
    get T(): T {
      throw new Error(`ServiceRef.T of ${id} is a type carrier and has no value`);
    },
    toString: () => `serviceRef{${id}}`,
  } as ServiceRef<T>;
}

/** Maps a record of references to the record of their instances. */
export type ResolvedDeps<TDeps> = { [K in keyof TDeps]: TDeps[K] extends { readonly T: infer U } ? U : never };

export type AnyServiceRef = ServiceRef<unknown>;

export interface ServiceFactoryContext {
  /** The plugin the instance is created for; absent for root services. */
  pluginId?: string;
}

export interface ServiceFactory<T = unknown, TScope extends ServiceScope = ServiceScope> {
  readonly $$type: '@fasrun/ServiceFactory';
  readonly service: ServiceRef<T, TScope>;
  readonly deps: Readonly<Record<string, AnyServiceRef>>;
  factory(deps: Record<string, unknown>, context: ServiceFactoryContext): T | Promise<T>;
}

/** Root services may only depend on other root services. */
type AllowedDeps<TScope extends ServiceScope> = Record<
  string,
  TScope extends 'root' ? ServiceRef<unknown, 'root'> : AnyServiceRef
>;

export function createServiceFactory<T, TScope extends ServiceScope, TDeps extends AllowedDeps<TScope>>(options: {
  service: ServiceRef<T, TScope>;
  deps: TDeps;
  factory(deps: ResolvedDeps<TDeps>, context: ServiceFactoryContext): T | Promise<T>;
}): ServiceFactory<T, TScope> {
  return {
    $$type: '@fasrun/ServiceFactory',
    service: options.service,
    deps: options.deps,
    factory: (deps, context) => options.factory(deps as ResolvedDeps<TDeps>, context),
  };
}
