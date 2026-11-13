import { createHash } from 'node:crypto';
import { actorContextSchema, operationContextSchema, newId, type ActorContext } from '@fasrun/contracts-core';
import {
  agentCallSchema,
  agentResultSchema,
  canonicalData,
  containsScope,
  type AgentCall,
  type AgentResult,
} from '@fasrun/plugin-orchestration-common';
import type { AgentInvoker } from '@fasrun/plugin-orchestration-node';
import type { AuditEvent } from '@fasrun/plugin-governance-common';
import type { AgentDependencies, AgentRecord } from './ports.js';
import { sanitizeOutput } from './output.js';

export class AgentCallError extends Error {
  constructor() {
    super('Agent call denied or unavailable');
    this.name = 'AgentCallError';
  }
}
export function createAgentInvoker(deps: AgentDependencies): AgentInvoker {
  const implementations = new Map(deps.implementations.map((entry) => [entry.id, Object.freeze({ ...entry })]));
  if (
    !['production', 'test', 'validation'].includes(deps.environment) ||
    implementations.size !== deps.implementations.length ||
    [...implementations.values()].some(
      (entry) =>
        !entry.id ||
        !entry.version ||
        !['real', 'controlled-fixture'].includes(entry.mode) ||
        (entry.mode === 'controlled-fixture' && (deps.environment === 'production' || deps.enableFixtures !== true)),
    )
  )
    throw new AgentCallError();
  const identity = (call: AgentCall) => ({
    version: 1 as const,
    callId: call.callId,
    attempt: call.attempt,
    implementationId: call.implementationId,
  });
  const failed = (call: AgentCall, code: string): AgentResult => ({
    ...identity(call),
    status: 'failed',
    error: {
      version: 1,
      type: 'https://fasrun.dev/problems/agent-call',
      title: 'Agent call failed',
      status: 502,
      code,
      traceId: call.actor.traceId,
    },
  });
  const audit = (call: AgentCall, action: string, details: AuditEvent['details'] = {}): AuditEvent => ({
    version: 1,
    eventId: newId('evt'),
    actor: call.actor,
    action: `orchestration.agent.${action}`,
    objectType: 'agent-call',
    objectId: call.callId,
    occurredAt: new Date().toISOString(),
    outcome: 'allowed',
    details,
  });
  async function check(call: AgentCall, actor: ActorContext = call.actor) {
    actor = actorContextSchema.parse(actor);
    if (
      actor.orgId !== call.orgId ||
      actor.actorId !== call.actor.actorId ||
      actor.actorKind !== call.actor.actorKind ||
      actor.authorizationId !== call.authorizationId
    )
      throw new AgentCallError();
    const context = operationContextSchema.parse({ ...deps.context(call), actor });
    if (
      context.object.id !== call.workId ||
      context.object.type !== 'work' ||
      [...call.allowedReadScopes, ...call.allowedWriteScopes].some((scope) => !containsScope(context.scope, scope))
    )
      throw new AgentCallError();
    const step = deps.step(call);
    if (
      step.kind !== 'agent' ||
      step.outputSchemaVersion !== call.outputSchemaVersion ||
      call.attempt > step.maxAttempts ||
      !implementations.has(call.implementationId) ||
      call.allowedWriteScopes.length === 0
    )
      throw new AgentCallError();
    step.input.parse(call.inputRefs);
    for (const permission of new Set([context.permission, ...step.permissions])) {
      if (!(await deps.authorize({ ...context, permission })).allowed) throw new AgentCallError();
    }
    for (const ref of call.inputRefs) {
      const scope = call.allowedReadScopes.find((candidate) =>
        ref.labels.readScopes.some((grant) => containsScope(grant, candidate)),
      );
      if (!scope) throw new AgentCallError();
      await deps.data.read({ context: { ...context, scope }, ref });
    }
    return { context, step };
  }
  async function boundary<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new AgentCallError();
    }
  }
  async function bounded<T>(deadlineAt: string, operation: () => Promise<T>): Promise<T> {
    const remaining = Date.parse(deadlineAt) - Date.now();
    if (remaining <= 0) throw new AgentCallError();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AgentCallError()), remaining);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function strippedAudit(call: AgentCall, fields: readonly string[]) {
    if (!fields.length) return;
    const known = ['steps', 'reviewers', 'gates', 'approved', 'plan', 'replanExplanation', 'replanReason'];
    await deps.repository.audit(
      audit(call, 'fields-stripped', {
        count: fields.length,
        controls: known.filter((name) => fields.some((field) => field.split('/').at(-1) === name)),
      }),
    );
  }
  async function accept(record: AgentRecord, raw: unknown): Promise<AgentRecord> {
    pinned(record);
    const { call } = record;
    const latest = await deps.repository.get(call.orgId, call.callId);
    if (!latest || latest.call.attempt !== call.attempt || latest.requestHash !== record.requestHash)
      throw new AgentCallError();
    if (latest.result) return latest;
    const { context, step } = await check(call);
    if (Date.parse(record.deadlineAt) <= Date.now())
      return deps.repository.complete(record, failed(call, 'orchestration.agent.deadline'), audit(call, 'deadline'));
    let result: AgentResult;
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid result');
      const source = raw as Record<string, unknown>;
      const allowed = [
        'version',
        'callId',
        'attempt',
        'implementationId',
        'status',
        ...(source.status === 'success'
          ? ['outputRefs', 'output', 'replanRequested', 'usage']
          : source.status === 'failed'
            ? ['error']
            : ['reason']),
      ];
      const stripped = Object.keys(source).filter((field) => !allowed.includes(field));
      const envelope = Object.fromEntries(Object.entries(source).filter(([field]) => allowed.includes(field)));
      if (source.status === 'success') {
        const clean = sanitizeOutput(step.output, source.output);
        envelope.output = clean.output;
        stripped.push(...clean.stripped);
      }
      result = agentResultSchema.parse(envelope);
      if (
        result.callId !== call.callId ||
        result.attempt !== call.attempt ||
        result.implementationId !== call.implementationId
      )
        throw new Error('Result identity mismatch');
      await strippedAudit(call, stripped);
      if (result.status === 'success') {
        // An implementation cannot forge or upgrade references. Existing returned
        // references must resolve under the current call's authority first.
        for (const ref of result.outputRefs) {
          if (ref.orgId !== call.orgId || ref.labels.trust !== 'untrusted')
            throw new Error('Untrusted result reference required');
          const scope = call.allowedReadScopes.find((candidate) =>
            ref.labels.readScopes.some((grant) => containsScope(grant, candidate)),
          );
          if (!scope) throw new Error('Result scope denied');
          await deps.data.read({ context: { ...context, scope }, ref });
        }
        const scope = call.allowedWriteScopes[0]!;
        const ref = await deps.data.register(
          { ...context, scope },
          {
            objectId: record.outputObjectId,
            category: 'agent-result',
            scope,
            value: result.output,
            labels: {
              source: { kind: 'agent', id: call.callId },
              trust: 'untrusted',
              readScopes: [scope],
              classification: call.inputRefs[0]?.labels.classification ?? 'repository',
              excludedChannels: [],
            },
            inputs: [...new Map([...call.inputRefs, ...result.outputRefs].map((input) => [input.id, input])).values()],
          },
        );
        result = { ...result, outputRefs: [ref] };
      } else if (result.status === 'failed') result = failed(call, 'orchestration.agent.failed');
      else result = { ...identity(call), status: 'cancelled', reason: 'Agent implementation cancelled' };
    } catch {
      result = failed(call, 'orchestration.agent.invalid_result');
    }
    await check(call);
    return deps.repository.complete(
      record,
      result,
      audit(call, 'completed', {
        status: result.status,
        implementationMode: record.implementationMode,
        implementationVersion: record.implementationVersion,
      }),
    );
  }
  function pinned(record: AgentRecord) {
    const registration = implementations.get(record.call.implementationId);
    if (
      !registration ||
      registration.mode !== record.implementationMode ||
      registration.version !== record.implementationVersion ||
      canonicalData([
        deps.step(record.call).plugin,
        deps.step(record.call).name,
        deps.step(record.call).implementationVersion,
      ]) !== record.stepVersion
    )
      throw new AgentCallError();
  }
  async function poll(record: AgentRecord): Promise<AgentRecord> {
    pinned(record);
    const { call } = record;
    if (record.result) return record;
    if (Date.parse(record.deadlineAt) <= Date.now())
      return deps.repository.complete(record, failed(call, 'orchestration.agent.deadline'), audit(call, 'deadline'));
    try {
      const driver = implementations.get(call.implementationId)!.implementation;
      const raw = await bounded(record.deadlineAt, () =>
        driver.getResult({ actor: call.actor, callId: call.callId, attempt: call.attempt }),
      );
      return raw === undefined || raw === null ? record : accept(record, raw);
    } catch {
      return deps.repository.complete(record, failed(call, 'orchestration.agent.unavailable'), audit(call, 'failed'));
    }
  }
  async function stored(actor: ActorContext, callId: string, attempt: number) {
    actor = actorContextSchema.parse(actor);
    const record = await deps.repository.get(actor.orgId, callId);
    if (!record || record.call.attempt !== attempt) throw new AgentCallError();
    await check(record.call, actor);
    pinned(record);
    return record;
  }
  return {
    invoke: (input) =>
      boundary(async () => {
        const call = agentCallSchema.parse(structuredClone(input));
        await check(call);
        const implementation = implementations.get(call.implementationId)!;
        const record = await deps.repository.claim(
          {
            call,
            requestHash: createHash('sha256').update(canonicalData(call)).digest('hex'),
            state: 'pending',
            result: null,
            outputObjectId: newId('obj'),
            implementationMode: implementation.mode,
            implementationVersion: implementation.version,
            deadlineAt: new Date(
              Math.min(Date.parse(call.deadline), Date.now() + deps.step(call).timeoutMs),
            ).toISOString(),
            stepVersion: canonicalData([
              deps.step(call).plugin,
              deps.step(call).name,
              deps.step(call).implementationVersion,
            ]),
          },
          audit(call, 'started', {
            implementationMode: implementation.mode,
            implementationVersion: implementation.version,
          }),
        );
        let current = await poll(record);
        if (!current.result) {
          // A cancel/new attempt may have committed while the transport poll waited.
          // Recheck before dispatch; a remote side effect and a DB commit are not atomic.
          const latest = await deps.repository.get(call.orgId, call.callId);
          if (!latest || latest.call.attempt !== call.attempt || latest.requestHash !== record.requestHash)
            throw new AgentCallError();
          pinned(latest);
          current = latest;
        }
        if (!current.result) {
          try {
            const raw = await bounded(record.deadlineAt, () => implementation.implementation.invoke(call));
            if (raw && typeof raw === 'object' && 'status' in raw && raw.status === 'pending') {
              await strippedAudit(
                call,
                Object.keys(raw).filter((field) => !['status', 'callId', 'attempt'].includes(field)),
              );
              if (
                !('callId' in raw) ||
                raw.callId !== call.callId ||
                !('attempt' in raw) ||
                raw.attempt !== call.attempt
              )
                throw new AgentCallError();
            } else current = await accept(current, raw);
          } catch {
            current = await deps.repository.complete(
              current,
              failed(call, 'orchestration.agent.unavailable'),
              audit(call, 'failed'),
            );
          }
        }
        await check(call);
        return current.result ?? { status: 'pending', callId: call.callId, attempt: call.attempt };
      }),
    getResult: (request) =>
      boundary(async () => {
        const current = await poll(await stored(request.actor, request.callId, request.attempt));
        await check(current.call, request.actor);
        return current.result;
      }),
    cancel: (request) =>
      boundary(async () => {
        const record = await stored(request.actor, request.callId, request.attempt);
        if (record.result) return;
        await deps.repository.complete(
          record,
          { ...identity(record.call), status: 'cancelled', reason: 'Cancelled by authorized actor' },
          audit(record.call, 'cancelled'),
        );
        try {
          await bounded(new Date(Date.now() + deps.step(record.call).timeoutMs).toISOString(), () =>
            implementations.get(record.call.implementationId)!.implementation.cancel(request),
          );
        } catch {
          await deps.repository.audit(audit(record.call, 'cancel-delivery-failed'));
        }
      }),
  };
}
