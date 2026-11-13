import { createServiceRef, createExtensionPoint } from '@fasrun/backend-plugin-api';
import type { OperationContext } from '@fasrun/contracts-core';
import type {
  InboxEvent,
  InboxReceipt,
  ExternalAction,
  ActionResult,
  Integration,
  RepositoryBinding,
  ExternalObject,
  CredentialEnvelope,
} from '@fasrun/plugin-connect-common';

export interface ConnectService {
  accept(context: OperationContext, event: InboxEvent): Promise<InboxReceipt>;
  reconcile(context: OperationContext, integrationId: string): Promise<{ cursor: string | null; completed: boolean }>;
  performAction(context: OperationContext, action: ExternalAction): Promise<ActionResult>;
  queryAction(context: OperationContext, actionId: string): Promise<ActionResult>;
}
/** Gateway adapters have no database or repository port. Unknown outcomes must be queried before retry. */
export interface ConnectAdapter {
  readonly provider: string;
  performAction(context: OperationContext, action: ExternalAction): Promise<ActionResult>;
  queryAction(context: OperationContext, actionId: string): Promise<ActionResult>;
}
export interface ConnectAdapters {
  register(adapter: ConnectAdapter): void;
}
export const connectAdapters = createExtensionPoint<ConnectAdapters>({ id: 'connect.adapters' });

/** Owner-bound root facade; its factory binds connect's repository, never the caller's schema. */
export const connectServiceRef = createServiceRef<ConnectService>({ id: 'connect.service', scope: 'root' });

/** Separate from workflow state and GitHub action adapters. Implementations live only in CORE. */
export interface ConnectStateService {
  configure(context: OperationContext, integration: Integration, binding: RepositoryBinding): Promise<void>;
  accept(context: OperationContext, repositoryId: string, event: InboxEvent): Promise<InboxReceipt>;
  observe(context: OperationContext, value: ExternalObject): Promise<void>;
  storeCredential(
    context: OperationContext,
    envelope: CredentialEnvelope,
    expectedVersion: string | null,
  ): Promise<void>;
  credential(context: OperationContext, integrationId: string): Promise<CredentialEnvelope>;
}
export const connectStateServiceRef = createServiceRef<ConnectStateService>({ id: 'connect.state', scope: 'root' });

export type { ActionClaim, ReconcilePosition, ConnectActionState, GitHubRepositoryRoute } from './actions.js';
