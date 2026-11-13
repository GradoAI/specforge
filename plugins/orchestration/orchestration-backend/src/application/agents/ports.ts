import type { ActorContext, DataReference, JsonValue, OperationContext } from '@fasrun/contracts-core';
import type { AgentCall, AgentResult } from '@fasrun/plugin-orchestration-common';
import type { AuditEvent } from '@fasrun/plugin-governance-common';
import type { StepDefinition } from '@fasrun/plugin-orchestration-node';
import type { createDataService } from '../data/service.js';
export interface AgentRecord {
  call: AgentCall;
  requestHash: string;
  state: 'pending' | 'success' | 'failed' | 'cancelled';
  result: AgentResult | null;
  outputObjectId: string;
  implementationMode: 'real' | 'controlled-fixture';
  implementationVersion: string;
  deadlineAt: string;
  stepVersion: string;
}
export interface AgentRepository {
  get(orgId: string, callId: string): Promise<AgentRecord | null>;
  /** Immutable call identity, request hash for one attempt, monotonic attempt CAS. */
  claim(record: AgentRecord, audit: AuditEvent): Promise<AgentRecord>;
  complete(record: AgentRecord, result: AgentResult, audit: AuditEvent): Promise<AgentRecord>;
  audit(event: AuditEvent): Promise<void>;
}
/** invoke/cancel must be idempotent for (callId, attempt); DB CAS does not make remote calls atomic.
 * Untrusted raw transport boundary: every result is validated by the persistent invoker. */
export interface AgentImplementation {
  invoke(call: AgentCall): Promise<unknown>;
  getResult(request: { actor: ActorContext; callId: string; attempt: number }): Promise<unknown>;
  cancel(request: { actor: ActorContext; callId: string; attempt: number; reason: string }): Promise<void>;
}
export interface AgentRegistration {
  id: string;
  version: string;
  mode: 'real' | 'controlled-fixture';
  implementation: AgentImplementation;
}
export interface AgentDependencies {
  repository: AgentRepository;
  implementations: readonly AgentRegistration[];
  environment: 'production' | 'test' | 'validation';
  enableFixtures?: boolean;
  /** Owner supplies the currently selected versioned step. Agent input never selects an arbitrary schema. */
  step(call: AgentCall): StepDefinition;
  authorize(context: OperationContext): Promise<{ allowed: boolean }>;
  data: Pick<ReturnType<typeof createDataService>, 'register' | 'read'>;
  /** Fixed trusted invocation context; scopes are never widened by result payload. */
  context(call: AgentCall): OperationContext;
}
export interface SanitizedOutput {
  output: JsonValue;
  stripped: string[];
  refs: DataReference[];
}
