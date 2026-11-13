import { createServiceRef, createExtensionPoint } from '@fasrun/backend-plugin-api';
import type { ActorContext, OperationContext, JsonValue, DataReference, MutationOptions } from '@fasrun/contracts-core';
import type { z } from 'zod';
import type { AgentCall, AgentResult, PlanRequest, PlanDocument, Work } from '@fasrun/plugin-orchestration-common';

export interface AgentInvoker {
  invoke(call: AgentCall): Promise<AgentResult | { status: 'pending'; callId: string; attempt: number }>;
  getResult(request: { actor: ActorContext; callId: string; attempt: number }): Promise<AgentResult | null>;
  cancel(request: { actor: ActorContext; callId: string; attempt: number; reason: string }): Promise<void>;
}
export interface Planner {
  plan(request: PlanRequest): Promise<PlanDocument>;
}
/** Adapter boundary: business repositories and DBOS system persistence remain separate. */
export interface RuntimeWorkflow {
  workflowId: string;
  implementationVersion: string;
}
export interface RuntimeMessage {
  messageId: string;
  topic: string;
  gateInstanceId: string;
  payload: JsonValue;
}
export interface DurableRuntime {
  startWorkflow(request: RuntimeWorkflow & { input: JsonValue }): Promise<RuntimeWorkflow>;
  /** The adapter executes a version-pinned registered step; it cannot evaluate arbitrary code from a plan. */
  runStep(request: {
    workflowId: string;
    stepRunId: string;
    idempotencyKey: string;
    plugin: string;
    stepName: string;
    implementationVersion: string;
    input: JsonValue;
  }): Promise<JsonValue>;
  send(request: { workflowId: string; message: RuntimeMessage }): Promise<void>;
  /** Persisted absolute deadline and gate instance survive retries and process recovery unchanged. */
  receiveUntil(request: {
    workflowId: string;
    topic: string;
    gateInstanceId: string;
    deadlineAt: string;
  }): Promise<{ status: 'received'; message: RuntimeMessage } | { status: 'deadline' }>;
  recover(request: { implementationVersion: string }): Promise<{ recoveredWorkflowIds: readonly string[] }>;
  /** Stop new work only; waiting workflows continue receiving messages until inflight reaches zero. */
  drain(request: { implementationVersion: string }): Promise<{ acceptingNewWork: false; inflight: number }>;
  result(workflowId: string): Promise<JsonValue>;
}
export interface OrchestrationService {
  createWork(
    context: OperationContext,
    request: { intakeId: string; authorizationId: string; sourceRef: DataReference; options: MutationOptions },
  ): Promise<Work>;
  getWork(context: OperationContext, workId: string): Promise<Work>;
  answer(
    context: OperationContext,
    request: { workId: string; gateId: string; contentRef: DataReference; options: MutationOptions },
  ): Promise<void>;
  instruct(
    context: OperationContext,
    request: { workId: string; contentRef: DataReference; options: MutationOptions },
  ): Promise<void>;
  control(
    context: OperationContext,
    request: { workId: string; action: 'pause' | 'resume' | 'cancel'; options: MutationOptions },
  ): Promise<Work>;
}
export interface StepDefinition {
  readonly plugin: string;
  readonly name: string;
  readonly implementationVersion: string;
  readonly kind: 'system' | 'agent';
  /** Schema version is independent of the implementation release. */
  readonly outputSchemaVersion: string;
  readonly input: z.ZodType<JsonValue>;
  readonly output: z.ZodType<JsonValue>;
  readonly permissions: readonly string[];
  readonly cost: number;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  /** T011 verifies this evidence before accepting a system step; a string alone is not proof. */
  readonly determinismEvidence?: { testId: string; implementationHash: string };
}
export interface StepRegistry {
  register(definition: StepDefinition): void;
}
export interface AgentInvokers {
  register(id: string, implementation: AgentInvoker): void;
}
export const steps = createExtensionPoint<StepRegistry>({ id: 'orchestration.steps' });
export const agentInvokers = createExtensionPoint<AgentInvokers>({ id: 'orchestration.agentInvokers' });

/** Owner-bound root facade; its factory binds orchestration's repository, never the caller's schema. */
export const orchestrationServiceRef = createServiceRef<OrchestrationService>({
  id: 'orchestration.service',
  scope: 'root',
});
