import type { OperationContext } from '@fasrun/contracts-core';
import type { OutboxEvent, OutboxPort } from '@fasrun/backend-plugin-api';
import type { AuditEvent, AuditRecord, PolicySnapshot } from '@fasrun/plugin-governance-common';
export interface GovernanceSession {
  policy(context: OperationContext): Promise<PolicySnapshot | undefined>;
  publishPolicy(snapshot: PolicySnapshot): Promise<void>;
  appendAudit(event: AuditEvent): Promise<AuditRecord>;
  auditRecords(): Promise<AuditRecord[]>;
  enqueue(event: OutboxEvent): Promise<void>;
  consume(eventId: string, work: () => Promise<void>): Promise<boolean>;
}
export interface GovernanceRepository {
  transaction<T>(orgId: string, actorId: string, work: (session: GovernanceSession) => Promise<T>): Promise<T>;
  outbox(orgId: string): OutboxPort;
}
