import type { OutboxEvent } from '@fasrun/backend-plugin-api';
import {
  actorContextSchema,
  operationContextSchema,
  type ActorContext,
  type JsonValue,
  type OperationContext,
} from '@fasrun/contracts-core';
import {
  auditEventSchema,
  policySnapshotSchema,
  effectivePolicyConstraintsSchema,
  evaluatePolicy,
  type AuditEvent,
  type AuditRecord,
  type PolicySnapshot,
  type PolicyEvaluation,
} from '@fasrun/plugin-governance-common';
import type { AuditCheckpointStore, GovernanceService } from '@fasrun/plugin-governance-node';
import type { GovernanceRepository } from '../common/ports.js';
import { auditHash, canonicalJson } from '../common/audit-hash.js';

export interface GovernanceDependencies {
  repository: GovernanceRepository;
  authorize(context: OperationContext): Promise<boolean>;
  /** Authenticates the publishing service/event provenance; never trusts an HTTP supplied actor. */
  authorizeAudit(event: AuditEvent): Promise<boolean>;
  checkpoints: AuditCheckpointStore;
  clock(): string;
  eventId(): string;
  redact(value: JsonValue): JsonValue;
  /** The host binds a trusted environment selector. Absence means no subscription exemption. */
  personalSubscription?(context: OperationContext): Promise<boolean>;
}
export class GovernanceDeniedError extends Error {
  constructor() {
    super('Governance access denied');
  }
}
class BudgetChangeDeniedError extends GovernanceDeniedError {}
export class GovernanceAuditError extends Error {
  constructor() {
    super('Governance audit unavailable or integrity check failed');
  }
}

export function verifyAuditChain(
  records: readonly AuditRecord[],
  checkpoint: { orgId: string; sequence: number; hash: string },
): boolean {
  let hash = '0'.repeat(64);
  let sequence = 0;
  for (const record of records) {
    if (
      record.event.actor.orgId !== checkpoint.orgId ||
      record.sequence !== ++sequence ||
      record.previousHash !== hash ||
      auditHash(hash, record.event) !== record.hash
    )
      return false;
    hash = record.hash;
  }
  return sequence === checkpoint.sequence && hash === checkpoint.hash;
}

export function createGovernanceService(deps: GovernanceDependencies): GovernanceService {
  const { repository, checkpoints } = deps;
  async function append(event: AuditEvent) {
    try {
      // Redact the entire event before the repository or external checkpoint sees it.
      const safe = auditEventSchema.parse(deps.redact(event as unknown as JsonValue));
      const record = await repository.transaction(safe.actor.orgId, safe.actor.actorId, (session) =>
        session.appendAudit(safe),
      );
      await checkpoints.publish({ orgId: safe.actor.orgId, sequence: record.sequence, hash: record.hash });
      return record;
    } catch {
      throw new GovernanceAuditError();
    }
  }
  function event(context: OperationContext, action: string, outcome: AuditEvent['outcome']): AuditEvent {
    return {
      version: 1,
      eventId: deps.eventId(),
      actor: context.actor,
      action,
      objectType: context.object.type,
      objectId: context.object.id,
      occurredAt: deps.clock(),
      outcome,
      details: {},
    };
  }
  async function admit(context: OperationContext) {
    operationContextSchema.parse(context);
    if (!(await deps.authorize(context))) {
      await append(event(context, context.permission, 'denied'));
      throw new GovernanceDeniedError();
    }
  }
  async function loadPolicy(context: OperationContext) {
    const snapshot = await repository.transaction(context.actor.orgId, context.actor.actorId, (session) =>
      session.policy(context),
    );
    if (!snapshot) throw new GovernanceDeniedError();
    policySnapshotSchema.parse(snapshot);
    effectivePolicyConstraintsSchema.parse(snapshot.constraints);
    if (snapshot.orgId !== context.actor.orgId) throw new GovernanceDeniedError();
    return snapshot;
  }
  const service = {
    async policy(context: OperationContext): Promise<PolicySnapshot> {
      await admit(context);
      await append(event(context, 'governance.policy.read', 'allowed'));
      return loadPolicy(context);
    },
    async audit(input: AuditEvent) {
      const parsed = auditEventSchema.parse(input);
      if (!(await deps.authorizeAudit(parsed))) throw new GovernanceDeniedError();
      const record = await append(parsed);
      return { eventId: record.event.eventId, sequence: record.sequence, hash: record.hash };
    },
    async consumeAudit(envelope: OutboxEvent) {
      const parsed = auditEventSchema.parse(envelope.payload);
      if (
        envelope.version !== 1 ||
        envelope.topic !== 'governance.audit.requested' ||
        envelope.orgId !== parsed.actor.orgId ||
        envelope.eventId !== parsed.eventId ||
        envelope.occurredAt !== parsed.occurredAt ||
        !(await deps.authorizeAudit(parsed))
      )
        throw new GovernanceDeniedError();
      const safeEvent = auditEventSchema.parse(deps.redact(parsed as unknown as JsonValue));
      const record = await repository.transaction(parsed.actor.orgId, parsed.actor.actorId, async (session) => {
        let appended: AuditRecord | undefined;
        await session.consume(envelope.eventId, async () => {
          appended = await session.appendAudit(safeEvent);
        });
        // Duplicate delivery may be recovering a failed external checkpoint publish.
        return appended ?? (await session.appendAudit(safeEvent));
      });
      await checkpoints.publish({ orgId: parsed.actor.orgId, sequence: record.sequence, hash: record.hash });
      return { eventId: record.event.eventId, sequence: record.sequence, hash: record.hash };
    },
    async publishPolicy(context: OperationContext, proposer: ActorContext, input: PolicySnapshot): Promise<void> {
      operationContextSchema.parse(context);
      actorContextSchema.parse(proposer);
      const snapshot = policySnapshotSchema.parse(input);
      effectivePolicyConstraintsSchema.parse(snapshot.constraints);
      if (
        context.actor.actorKind !== 'member' ||
        proposer.actorKind !== 'member' ||
        proposer.actorId === context.actor.actorId ||
        proposer.orgId !== context.actor.orgId ||
        snapshot.orgId !== context.actor.orgId
      )
        throw new GovernanceDeniedError();
      // Separate immutable actors, current permissions, and one atomic policy+audit transaction.
      await admit({ ...context, actor: proposer, permission: 'policy.propose' });
      await admit({ ...context, permission: 'policy.confirm' });
      const safeEvent = auditEventSchema.parse(
        deps.redact({
          ...event(context, 'governance.policy.published', 'allowed'),
          details: { policyId: snapshot.id, policyVersion: snapshot.policyVersion, proposer },
        } as unknown as JsonValue),
      );
      const record = await repository
        .transaction(context.actor.orgId, context.actor.actorId, async (session) => {
          const previous = await session.policy(context);
          // Removing constraints is a budget change too; a policy confirmer cannot silently clear a cap.
          if (canonicalJson(previous?.constraints.budgets ?? []) !== canonicalJson(snapshot.constraints.budgets)) {
            if (!(await deps.authorize({ ...context, permission: 'budget.manage' })))
              throw new BudgetChangeDeniedError();
          }
          await session.publishPolicy(snapshot);
          return session.appendAudit(safeEvent);
        })
        .catch(async (error: unknown) => {
          // The repository has rolled back and released its connection before denial auditing.
          // Never acquire a second transaction while the policy transaction holds a pool slot.
          if (error instanceof BudgetChangeDeniedError) {
            await append(event({ ...context, permission: 'budget.manage' }, 'budget.manage', 'denied'));
          }
          throw error;
        });
      await checkpoints.publish({ orgId: context.actor.orgId, sequence: record.sequence, hash: record.hash });
    },
    async evaluate(input: PolicyEvaluation) {
      await admit(input.context);
      const snapshot = await loadPolicy(input.context);
      const decision = evaluatePolicy(snapshot, input, (await deps.personalSubscription?.(input.context)) ?? false);
      await append({
        ...event(input.context, input.context.permission, decision.allowed ? 'allowed' : 'denied'),
        details: {
          policyVersion: decision.policyVersion,
          reasons: decision.reasons,
          estimatedCost: decision.estimatedCost,
        },
      });
      return decision;
    },
    async sensitiveRead<T>(input: PolicyEvaluation, read: () => Promise<T>): Promise<T> {
      const decision = await service.evaluate(input);
      if (!decision.allowed) throw new GovernanceDeniedError();
      // Explicit revocation may occur while audit/checkpoint writes await IO: recheck immediately before reading.
      await admit(input.context);
      return read();
    },
    async queryAudit(context: OperationContext): Promise<AuditRecord[]> {
      const query = { ...context, permission: 'audit.view' };
      await admit(query);
      await append(event(query, 'governance.audit.read', 'allowed'));
      await admit(query);
      return repository.transaction(query.actor.orgId, query.actor.actorId, (session) => session.auditRecords());
    },
    async verifyAudit(context: OperationContext): Promise<boolean> {
      await admit({ ...context, permission: 'audit.view' });
      const checkpoint = await checkpoints.load(context.actor.orgId);
      if (!checkpoint) return false; // A self-consistent local chain is not external evidence.
      const records = await repository.transaction(context.actor.orgId, context.actor.actorId, (session) =>
        session.auditRecords(),
      );
      return verifyAuditChain(records, checkpoint);
    },
  };
  // Storage/auth adapters can throw credentials-bearing connection or provider errors.
  // No unfiltered exception crosses the public application boundary.
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof GovernanceDeniedError || error instanceof GovernanceAuditError) throw error;
      // eslint-disable-next-line preserve-caught-error -- Provider causes may contain credentials; this public boundary intentionally omits them.
      throw new Error('Governance operation failed');
    }
  }
  return {
    policy: (context: OperationContext) => safe(() => service.policy(context)),
    audit: (input: AuditEvent) => safe(() => service.audit(input)),
    consumeAudit: (input: OutboxEvent) => safe(() => service.consumeAudit(input)),
    publishPolicy: (context: OperationContext, proposer: ActorContext, input: PolicySnapshot) =>
      safe(() => service.publishPolicy(context, proposer, input)),
    evaluate: (input: PolicyEvaluation) => safe(() => service.evaluate(input)),
    sensitiveRead: <T>(input: PolicyEvaluation, read: () => Promise<T>) =>
      safe(() => service.sensitiveRead(input, read)),
    queryAudit: (context: OperationContext) => safe(() => service.queryAudit(context)),
    verifyAudit: (context: OperationContext) => safe(() => service.verifyAudit(context)),
  };
}
