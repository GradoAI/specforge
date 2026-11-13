import type { OperationContext, Scope } from '@fasrun/contracts-core';
import type { ExternalAction, ActionResult } from '@fasrun/plugin-connect-common';
import type { ActionClaim, ReconcilePosition } from '@fasrun/plugin-connect-node';
export interface ActionRepository {
  scope(context: OperationContext, integrationId: string, repositoryId: string): Promise<Scope>;
  register(context: OperationContext, action: ExternalAction): Promise<ActionResult>;
  load(context: OperationContext, actionId: string): Promise<ExternalAction>;
  claim(context: OperationContext, actionId: string): Promise<ActionClaim>;
  settle(context: OperationContext, actionId: string, token: string, result: ActionResult): Promise<void>;
  query(context: OperationContext, actionId: string): Promise<ActionResult>;
  position(context: OperationContext, integrationId: string, repositoryId: string): Promise<ReconcilePosition>;
  checkpoint(
    context: OperationContext,
    integrationId: string,
    repositoryId: string,
    previous: ReconcilePosition,
    next: Pick<ReconcilePosition, 'cursor' | 'highWatermark'>,
  ): Promise<ReconcilePosition>;
}
