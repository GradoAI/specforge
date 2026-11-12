import type { GovernanceService } from '@fasrun/plugin-governance-node';
import { operationContextSchema, newId, type OperationContext } from '@fasrun/contracts-core';
import { environmentSnapshotSchema, type EnvironmentSnapshot } from '@fasrun/plugin-environment-common';
import type { EnvironmentService } from '@fasrun/plugin-environment-node';

export interface EnvironmentDependencies {
  audit: Pick<GovernanceService, 'audit'>;
  clock?: () => string;
  /** Authorize the actual requested template/version and its association with the project/work scope. */
  authorize(context: OperationContext, request: { templateId: string; templateVersion: string }): Promise<boolean>;
  load(
    context: OperationContext,
    request: { templateId: string; templateVersion: string },
  ): Promise<EnvironmentSnapshot | undefined>;
}
class EnvironmentError extends Error {}
export function createEnvironmentService(deps: EnvironmentDependencies): EnvironmentService {
  return {
    async snapshot(context, request) {
      try {
        operationContextSchema.parse(context);
        if (!request.templateId || !request.templateVersion)
          throw new EnvironmentError('Explicit environment template version is required');
        async function audit(outcome: 'allowed' | 'denied'): Promise<void> {
          await deps.audit.audit({
            version: 1,
            eventId: newId('evt'),
            actor: context.actor,
            action: 'environment.template.read',
            objectType: 'environment_template',
            objectId: `${request.templateId}@${request.templateVersion}`,
            occurredAt: deps.clock?.() ?? new Date().toISOString(),
            outcome,
            details: {},
          });
        }
        async function authorize(): Promise<void> {
          if (!(await deps.authorize(context, request))) {
            await audit('denied');
            throw new EnvironmentError('Environment access denied');
          }
        }
        await authorize();
        await audit('allowed');
        const result = environmentSnapshotSchema.parse(await deps.load(context, request));
        if (
          result.orgId !== context.actor.orgId ||
          result.templateId !== request.templateId ||
          result.templateVersion !== request.templateVersion
        )
          throw new EnvironmentError('Environment snapshot identity mismatch');
        await authorize();
        return result;
      } catch (error) {
        if (error instanceof EnvironmentError) throw error;
        // eslint-disable-next-line preserve-caught-error -- Adapter causes can contain credentials.
        throw new Error('Environment snapshot invalid or unavailable');
      }
    },
  };
}
