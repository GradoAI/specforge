import { newId, operationContextSchema, type OperationContext } from '@fasrun/contracts-core';
import {
  integrationSchema,
  repositoryBindingSchema,
  credentialEnvelopeSchema,
  externalObjectSchema,
  inboxEventSchema,
  type Integration,
  type RepositoryBinding,
  type CredentialEnvelope,
  type ExternalObject,
  type InboxEvent,
} from '@fasrun/plugin-connect-common';
import type { GovernanceService } from '@fasrun/plugin-governance-node';
import type { ConnectRepository, ConnectAuthority } from '../common/ports.js';
export interface ConnectStateDependencies {
  repository: ConnectRepository;
  authority: ConnectAuthority;
  audit: Pick<GovernanceService, 'audit'>;
}
export function createConnectState(deps: ConnectStateDependencies) {
  async function permitted(
    context: OperationContext,
    permission: string,
    type: string,
    id: string,
    scope = context.scope,
  ) {
    operationContextSchema.parse(context);
    const actual = { ...context, permission: 'integration.manage', object: { type, id }, scope };
    const allowed = await deps.authority.authorize(actual);
    await deps.audit.audit({
      version: 1,
      eventId: newId('evt'),
      actor: context.actor,
      action: permission,
      objectType: type,
      objectId: id,
      occurredAt: new Date().toISOString(),
      outcome: allowed ? 'allowed' : 'denied',
      details: {},
    });
    if (!allowed) throw new Error('Connect access denied');
    return actual;
  }
  async function bound(context: OperationContext, installationId: string, repositoryId: string) {
    const binding = await deps.repository.binding(context, installationId, repositoryId);
    if (!binding?.active || binding.scope.orgId !== context.actor.orgId) throw new Error('Connect binding unavailable');
    return binding;
  }
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      throw new Error('Connect operation rejected or unavailable');
    }
  }
  return {
    mode: 'core-state' as const,
    configure(context: OperationContext, input: Integration, target: RepositoryBinding) {
      return safe(async () => {
        const integration = integrationSchema.parse(input),
          binding = repositoryBindingSchema.parse(target);
        if (
          integration.orgId !== context.actor.orgId ||
          binding.scope.orgId !== integration.orgId ||
          binding.integrationId !== integration.id
        )
          throw new Error('Invalid scope');
        const actual = await permitted(context, 'integration.manage', 'integration', integration.id, {
          orgId: context.actor.orgId,
        });
        await deps.repository.configure(actual, integration, binding);
      });
    },
    accept(context: OperationContext, repositoryId: string, input: InboxEvent) {
      return safe(async () => {
        const event = inboxEventSchema.parse(input);
        if (
          event.orgId !== context.actor.orgId ||
          event.payloadRef.labels.trust !== 'untrusted' ||
          event.payloadRef.labels.source.kind !== 'external'
        )
          throw new Error('Invalid event');
        const binding = await bound(context, event.installationId, repositoryId);
        const actual = await permitted(context, 'connect.inbox.accept', 'repository', repositoryId, binding.scope);
        return deps.repository.accept(actual, repositoryId, event);
      });
    },
    observe(context: OperationContext, input: ExternalObject) {
      return safe(async () => {
        const value = externalObjectSchema.parse(input),
          integration = await deps.repository.integration(context, value.integrationId);
        if (!integration?.active) throw new Error('Unknown integration');
        const binding = await bound(context, integration.installationId, value.repositoryId);
        const actual = await permitted(
          context,
          'connect.object.observe',
          'repository',
          value.repositoryId,
          binding.scope,
        );
        await deps.repository.saveObject(actual, value);
      });
    },
    storeCredential(context: OperationContext, input: CredentialEnvelope, expectedVersion: string | null) {
      return safe(async () => {
        const value = credentialEnvelopeSchema.parse(input);
        if (value.orgId !== context.actor.orgId) throw new Error('Wrong tenant');
        const actual = await permitted(context, 'integration.manage', 'integration', value.integrationId, {
          orgId: context.actor.orgId,
        });
        if (!(await deps.repository.integration(actual, value.integrationId))?.active)
          throw new Error('Unknown integration');
        await deps.repository.putCredential(actual, value, expectedVersion);
      });
    },
    credential(context: OperationContext, integrationId: string) {
      return safe(async () => {
        const actual = await permitted(context, 'connect.credential.use', 'integration', integrationId, {
          orgId: context.actor.orgId,
        });
        if (!(await deps.repository.integration(actual, integrationId))?.active) throw new Error('Unknown integration');
        const envelope = await deps.repository.credential(actual, integrationId);
        await permitted(context, 'connect.credential.use', 'integration', integrationId, {
          orgId: context.actor.orgId,
        });
        if (!envelope) throw new Error('Missing credential');
        return envelope;
      });
    },
  };
}
export type ConnectState = ReturnType<typeof createConnectState>;
