import type { OperationContext, DataReference, DataLabels, JsonValue } from '@fasrun/contracts-core';
import type { FileStorageService, OutboxPort } from '@fasrun/backend-plugin-api';
import type { AuditEvent } from '@fasrun/plugin-governance-common';
import type { DataObject } from '@fasrun/plugin-orchestration-common';
export interface DataRepository {
  find(orgId: string, actorId: string, uri: string): Promise<DataObject | undefined>;
  /** Index and mutation audit intent commit together, after durable file publication. */
  insert(context: OperationContext, object: DataObject, audit: AuditEvent): Promise<void>;
  outbox(orgId: string): OutboxPort;
}
export interface DataResolver {
  readonly ownerPlugin: string;
  resolve(context: OperationContext, uri: string): Promise<{ ref: DataReference; value: JsonValue }>;
}
export interface DataDependencies {
  repository: DataRepository;
  storage: FileStorageService;
  authorize(context: OperationContext): Promise<{ allowed: boolean }>;
  audit(event: AuditEvent): Promise<unknown>;
  /** Current governance policy and channel visibility, provided by the trusted composition root. */
  policy(context: OperationContext, refs: readonly DataReference[], channel: string): Promise<{ allowed: boolean }>;
  /** Host registration verifies this exact output digest and current producer/call provenance, not a supplied source name. */
  trustedProducer(
    context: OperationContext,
    output: { source: DataLabels['source']; contentHash: string; labels: DataLabels; inputRefs: readonly string[] },
  ): Promise<boolean>;
  /** Verifies actual current review/head/content and returns evidence. Never accept client self-attestation. */
  confirmation(
    context: OperationContext,
    original: DataReference,
    headCommit: string,
  ): Promise<{
    memberId: string;
    headCommit: string;
    originalRef: string;
    basis: string;
    permission: 'spec.approve_requirements' | 'spec.approve_design' | 'pr.review';
  }>;
  resolvers?: readonly DataResolver[];
}
