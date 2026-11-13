import { operationContextSchema, newId, type OperationContext } from '@fasrun/contracts-core';
import { externalActionSchema, actionResultSchema, type ExternalAction } from '@fasrun/plugin-connect-common';
import type { ConnectActionState } from '@fasrun/plugin-connect-node';
import type { GovernanceService } from '@fasrun/plugin-governance-node';
import type { ConnectAuthority } from '../../common/ports.js';
import type { ActionRepository } from './ports.js';
/** All actions target a configured immutable repository ID; object numbers remain untrusted payload data. */
export function createActionState(deps: {
  repository: ActionRepository;
  authority: ConnectAuthority;
  audit: Pick<GovernanceService, 'audit'>;
}): ConnectActionState {
  async function permitted(context: OperationContext, integrationId: string, repositoryId: string) {
    context = operationContextSchema.parse(context);
    const scope = await deps.repository.scope(context, integrationId, repositoryId);
    const actual = {
      ...context,
      scope,
      permission: 'integration.manage',
      object: { type: 'repository', id: repositoryId },
    };
    const allowed = await deps.authority.authorize(actual);
    await deps.audit.audit({
      version: 1,
      eventId: newId('evt'),
      actor: context.actor,
      action: 'connect.action.access',
      objectType: 'repository',
      objectId: repositoryId,
      occurredAt: new Date().toISOString(),
      outcome: allowed ? 'allowed' : 'denied',
      details: {},
    });
    if (!allowed) throw new Error('Connect action denied');
    return actual;
  }
  async function existing(context: OperationContext, id: string) {
    context = operationContextSchema.parse(context);
    // Loading owner-internal metadata is not an outward read; no action/result is returned before permission and audit.
    const action = await deps.repository.load(context, id);
    return permitted(context, action.integrationId, action.targetId);
  }
  async function safe<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch {
      throw new Error('Connect action rejected or unavailable');
    }
  }
  function checked(context: OperationContext, input: ExternalAction) {
    const a = externalActionSchema.parse(input);
    if (a.payloadRef.orgId !== context.actor.orgId || a.payloadRef.labels.excludedChannels.includes('github'))
      throw new Error('Outbound scope denied');
    return a;
  }
  return {
    register(context, input) {
      return safe(async () => {
        const a = checked(context, input);
        const actual = await permitted(context, a.integrationId, a.targetId);
        return deps.repository.register(actual, a);
      });
    },
    claim(context, id) {
      return safe(async () => deps.repository.claim(await existing(context, id), id));
    },
    settle(context, id, token, input) {
      return safe(async () => {
        const result = actionResultSchema.parse(input);
        if (result.actionId !== id) throw new Error('Action mismatch');
        await deps.repository.settle(await existing(context, id), id, token, result);
      });
    },
    query(context, id) {
      return safe(async () => deps.repository.query(await existing(context, id), id));
    },
    position(context, integrationId, repositoryId) {
      return safe(async () =>
        deps.repository.position(await permitted(context, integrationId, repositoryId), integrationId, repositoryId),
      );
    },
    checkpoint(context, integrationId, repositoryId, previous, next) {
      context = operationContextSchema.parse(context);
      previous = { ...previous };
      next = { ...next };
      return safe(async () => {
        if (
          next.highWatermark &&
          (!Number.isFinite(Date.parse(next.highWatermark)) ||
            (previous.highWatermark && next.highWatermark < previous.highWatermark))
        )
          throw new Error('Invalid watermark');
        if (next.cursor !== null && (next.cursor.length > 4096 || next.highWatermark !== previous.highWatermark))
          throw new Error('Incomplete reconciliation');
        return deps.repository.checkpoint(
          await permitted(context, integrationId, repositoryId),
          integrationId,
          repositoryId,
          previous,
          next,
        );
      });
    },
  };
}
