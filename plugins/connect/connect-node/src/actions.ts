import type { OperationContext, Scope } from '@fasrun/contracts-core';
import type { ExternalAction, ActionResult } from '@fasrun/plugin-connect-common';
/** CORE-owned state. Transport hosts must bind these methods to authenticated current actors. */
export interface ActionClaim {
  action: ExternalAction;
  result: ActionResult;
  leaseToken: string | null;
  /** Only a never-sent or definitively rejected request may be sent. Unknown outcomes are query-only. */
  dispatch: boolean;
}
export interface ReconcilePosition {
  version: number;
  highWatermark: string | null;
  cursor: string | null;
}
export interface ConnectActionState {
  register(context: OperationContext, action: ExternalAction): Promise<ActionResult>;
  claim(context: OperationContext, actionId: string): Promise<ActionClaim>;
  settle(context: OperationContext, actionId: string, leaseToken: string, result: ActionResult): Promise<void>;
  query(context: OperationContext, actionId: string): Promise<ActionResult>;
  position(context: OperationContext, integrationId: string, repositoryId: string): Promise<ReconcilePosition>;
  checkpoint(
    context: OperationContext,
    integrationId: string,
    repositoryId: string,
    previous: ReconcilePosition,
    next: { cursor: string | null; highWatermark: string | null },
  ): Promise<ReconcilePosition>;
}
/** A trusted configured route, not fields chosen by webhook bodies or names supplied by an external author. */
export interface GitHubRepositoryRoute {
  integrationId: string;
  installationId: string;
  repositoryId: string;
  owner: string;
  name: string;
  scope: Scope;
  context: OperationContext;
}
