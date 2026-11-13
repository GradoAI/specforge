import { operationContextSchema, type OperationContext } from '@fasrun/contracts-core';
import type { InboxEvent, InboxReceipt, CredentialEnvelope } from '@fasrun/plugin-connect-common';
import { inboxEventSchema, inboxReceiptSchema } from '@fasrun/plugin-connect-common';
import type { CredentialCipher } from '../common/ports.js';
/** Implemented over authenticated mTLS. It intentionally exposes no DB or workflow/gate mutation. */
export interface CoreStateClient {
  accept(context: OperationContext, repositoryId: string, event: InboxEvent): Promise<InboxReceipt>;
  storeCredential(
    context: OperationContext,
    envelope: CredentialEnvelope,
    expectedVersion: string | null,
  ): Promise<void>;
  credential(context: OperationContext, integrationId: string): Promise<CredentialEnvelope>;
}
export interface VerifiedDelivery {
  context: OperationContext;
  repositoryId: string;
  event: InboxEvent;
}
export function createConnectGateway(options: {
  core: CoreStateClient;
  cipher: CredentialCipher;
  authorize(context: OperationContext, integrationId: string): Promise<boolean>;
  /** Trusted provider adapter verifies ORIGINAL bytes, signature and installation ownership. T009 implements GitHub HMAC. */
  verify(bytes: Buffer, headers: Readonly<Record<string, string>>): Promise<VerifiedDelivery>;
  /** A trusted provider probe validates a proposed credential before changing the active pointer. */
  validateCredential(context: OperationContext, integrationId: string, plaintext: Buffer): Promise<void>;
}) {
  if (!options.core || !options.cipher || !options.authorize || !options.verify || !options.validateCredential)
    throw new Error('Gateway dependencies missing');
  const cipher = options.cipher;
  async function safe<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch {
      throw new Error('Gateway operation rejected or unavailable');
    }
  }
  return {
    mode: 'gateway' as const,
    receive(bytes: Buffer, headers: Readonly<Record<string, string>>) {
      return safe(async () => {
        const verified = await options.verify(Buffer.from(bytes), Object.freeze({ ...headers }));
        const event = inboxEventSchema.parse(verified.event);
        const receipt = inboxReceiptSchema.parse(
          await options.core.accept(verified.context, verified.repositoryId, event),
        );
        if (receipt.deliveryId !== event.deliveryId) throw new Error('Invalid durable receipt');
        return receipt;
      });
    },
    rotate(
      context: OperationContext,
      integrationId: string,
      version: string,
      plaintext: Buffer,
      expectedVersion: string | null,
    ) {
      return safe(async () => {
        const copy = Buffer.from(plaintext);
        try {
          const actual = operationContextSchema.parse({
            ...context,
            permission: 'integration.manage',
            scope: { orgId: context.actor.orgId },
            object: { type: 'integration', id: integrationId },
          });
          if (!(await options.authorize(actual, integrationId))) throw new Error('Credential management denied');
          await options.validateCredential(actual, integrationId, copy);
          const envelope = cipher.encrypt(context.actor.orgId, integrationId, version, copy);
          await options.core.storeCredential(actual, envelope, expectedVersion);
        } finally {
          copy.fill(0);
        }
      });
    },
    /** Each new call/retry reads the current active envelope. Already fetched/in-flight uses are not atomically cancelled; external effects are not rolled back. No plaintext-returning query. */
    useCredential<T>(context: OperationContext, integrationId: string, consume: (secret: Buffer) => Promise<T>) {
      return safe(async () => {
        const envelope = await options.core.credential(context, integrationId);
        return cipher.use(
          envelope,
          { orgId: context.actor.orgId, integrationId, credentialVersion: envelope.credentialVersion },
          consume,
        );
      });
    },
  };
}
