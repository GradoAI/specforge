import {
  createServiceRef,
  createExtensionPoint,
  type OutboxEvent,
  type OutboxRegistry,
} from '@fasrun/backend-plugin-api';
import type { OperationContext, ActorContext, JsonValue } from '@fasrun/contracts-core';
import type { z } from 'zod';
import type {
  AuditCheckpoint,
  AuditEvent,
  AuditRecord,
  PolicyDecision,
  PolicyEvaluation,
  PolicySnapshot,
} from '@fasrun/plugin-governance-common';

export interface GovernanceService {
  policy(context: OperationContext): Promise<PolicySnapshot>;
  audit(event: AuditEvent): Promise<{ eventId: string; sequence: number; hash: string }>;
  consumeAudit(event: OutboxEvent): Promise<{ eventId: string; sequence: number; hash: string }>;
  publishPolicy(context: OperationContext, proposer: ActorContext, snapshot: PolicySnapshot): Promise<void>;
  evaluate(input: PolicyEvaluation): Promise<PolicyDecision>;
  sensitiveRead<T>(input: PolicyEvaluation, read: () => Promise<T>): Promise<T>;
  queryAudit(context: OperationContext): Promise<AuditRecord[]>;
  verifyAudit(context: OperationContext): Promise<boolean>;
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

/** Hosted outside the governance database and independently retained; no same-database fallback. */
export interface AuditCheckpointStore {
  load(orgId: string): Promise<AuditCheckpoint | undefined>;
  /** Must monotonically retain the greatest sequence; a same-sequence hash mismatch is an error. */
  publish(checkpoint: AuditCheckpoint): Promise<void>;
}
