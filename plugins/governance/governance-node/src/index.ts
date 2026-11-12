import { createServiceRef, createExtensionPoint, type OutboxRegistry } from '@fasrun/backend-plugin-api';
import type { OperationContext, JsonValue } from '@fasrun/contracts-core';
import type { z } from 'zod';
import type { AuditEvent, PolicySnapshot } from '@fasrun/plugin-governance-common';

export interface GovernanceService {
  policy(context: OperationContext): Promise<PolicySnapshot>;
  audit(event: AuditEvent): Promise<{ eventId: string; sequence: number; hash: string }>;
}
export interface ConditionDefinition {
  readonly name: string;
  readonly parameters: z.ZodType<JsonValue>;
  evaluate(parameters: JsonValue, facts: Readonly<Record<string, JsonValue>>): boolean;
}
export interface ConditionRegistry {
  register(definition: ConditionDefinition): void;
}
export const conditions = createExtensionPoint<ConditionRegistry>({ id: 'governance.conditions' });
export const outboxes = createExtensionPoint<OutboxRegistry>({ id: 'governance.outboxes' });

/** Owner-bound root facade; its factory binds governance's repository, never the caller's schema. */
export const governanceServiceRef = createServiceRef<GovernanceService>({ id: 'governance.service', scope: 'root' });
