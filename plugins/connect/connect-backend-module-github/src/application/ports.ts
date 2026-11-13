import type { DataReference, JsonValue, OperationContext } from '@fasrun/contracts-core';
import type { GitHubRepositoryRoute, ConnectActionState, ConnectStateService } from '@fasrun/plugin-connect-node';
export interface GitHubReferences {
  /** Durable immutable registration with external/untrusted labels and tenant scope; implementation owned by data plugin. */
  external(route: GitHubRepositoryRoute, sourceId: string, data: JsonValue): Promise<DataReference>;
  read(context: OperationContext, ref: DataReference): Promise<JsonValue>;
  /** Enforces current authorization/revocation, labels and channel visibility for the exact reference and target. */
  outbound(context: OperationContext, ref: DataReference, route: GitHubRepositoryRoute): Promise<JsonValue>;
}
export interface GitHubCredentials {
  /** Obtains a current repository-scoped installation token inside the gateway boundary, never persists it in CORE. */
  use<T>(route: GitHubRepositoryRoute, consume: (token: string) => Promise<T>): Promise<T>;
  webhookSecret(installationId: string, consume: (secret: Buffer) => boolean): Promise<boolean>;
}
export interface GitHubDependencies {
  routes: readonly GitHubRepositoryRoute[];
  core: Pick<ConnectStateService, 'accept' | 'observe'>;
  actions: ConnectActionState;
  references: GitHubReferences;
  credentials: GitHubCredentials;
  /** The trusted identity implementation records unresolved immutable-ID associations for later replay. */
  resolveExternal(
    context: OperationContext,
    input: { provider: string; issuer: string; subject: string; eventId: string },
  ): Promise<{ kind: 'resolved'; memberId: string } | { kind: 'unresolved' }>;
  /** Current identity decision for the configured route. External author is never used as a management actor. */
  authorize(context: OperationContext): Promise<boolean>;
  /** Trusted deployment audit sink; unknown/unverified input must never select a victim tenant. */
  reject(
    reason: 'webhook_rejected' | 'observation_failed' | 'outbound_failed',
    route?: GitHubRepositoryRoute,
  ): Promise<void>;
  /** Durable safe outcome audit; permission_denied is a needs-human signal, never a delivered result. */
  outcome(
    context: OperationContext,
    input: {
      actionId: string;
      reason:
        'delivered' | 'rate_limited' | 'permission_denied' | 'remote_unknown' | 'query_absent' | 'request_rejected';
    },
  ): Promise<void>;
  clock?: () => Date;
}
