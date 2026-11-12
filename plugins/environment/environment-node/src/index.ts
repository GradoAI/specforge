import { createServiceRef } from '@fasrun/backend-plugin-api';
import type { OperationContext } from '@fasrun/contracts-core';
import type { EnvironmentSnapshot } from '@fasrun/plugin-environment-common';

export interface EnvironmentService {
  snapshot(
    context: OperationContext,
    request: { templateId: string; templateVersion: string },
  ): Promise<EnvironmentSnapshot>;
}

/** Owner-bound root facade; its factory binds environment's repository, never the caller's schema. */
export const environmentServiceRef = createServiceRef<EnvironmentService>({ id: 'environment.service', scope: 'root' });
