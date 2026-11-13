import type { OperationContext } from '@fasrun/contracts-core';
import type { OutboxPort } from '@fasrun/backend-plugin-api';
import type {
  Integration,
  RepositoryBinding,
  CredentialEnvelope,
  ExternalObject,
  InboxEvent,
  InboxReceipt,
} from '@fasrun/plugin-connect-common';
export interface ConnectRepository {
  configure(context: OperationContext, integration: Integration, binding: RepositoryBinding): Promise<void>;
  integration(context: OperationContext, id: string): Promise<Integration | undefined>;
  binding(
    context: OperationContext,
    installationId: string,
    repositoryId: string,
  ): Promise<RepositoryBinding | undefined>;
  accept(context: OperationContext, repositoryId: string, event: InboxEvent): Promise<InboxReceipt>;
  saveObject(context: OperationContext, value: ExternalObject): Promise<void>;
  putCredential(context: OperationContext, envelope: CredentialEnvelope, expectedVersion: string | null): Promise<void>;
  credential(context: OperationContext, integrationId: string): Promise<CredentialEnvelope | undefined>;
  outbox(orgId: string): OutboxPort;
}
/** Host-created adapter must evaluate CURRENT identity, authorization revocation, target scope and operation.
 * mTLS authenticates a service only; it does not grant a business permission. */
export interface ConnectAuthority {
  authorize(context: OperationContext): Promise<boolean>;
}

export interface CredentialCipher {
  encrypt(orgId: string, integrationId: string, credentialVersion: string, plaintext: Buffer): CredentialEnvelope;
  use<T>(
    input: CredentialEnvelope,
    expected: { orgId: string; integrationId: string; credentialVersion: string },
    consume: (plaintext: Buffer) => Promise<T>,
  ): Promise<T>;
}
