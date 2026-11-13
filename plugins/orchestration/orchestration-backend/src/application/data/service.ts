import { createHash } from 'node:crypto';
import {
  operationContextSchema,
  referenceUriSchema,
  dataReferenceSchema,
  dataLabelsSchema,
  jsonValueSchema,
  scopeSchema,
  newId,
  isId,
  type OperationContext,
  type DataReference,
  type DataLabels,
  type JsonValue,
  type Scope,
  type ProtectedRead,
} from '@fasrun/contracts-core';
import {
  canonicalData,
  containsScope,
  referenceVersion,
  derivedLabels,
  normalizeLabels,
  type DataObject,
} from '@fasrun/plugin-orchestration-common';
import type { AuditEvent } from '@fasrun/plugin-governance-common';
import type { DataDependencies } from './ports.js';

export class DataAccessError extends Error {
  constructor() {
    super('Data operation denied or unavailable');
    this.name = 'DataAccessError';
  }
}
class DataCheckFailure extends Error {
  constructor(
    readonly reason:
      | 'authorization-denied'
      | 'policy-denied'
      | 'reference-scope-denied'
      | 'channel-excluded'
      | 'outbound-effect-failed',
  ) {
    super(reason);
  }
}
export interface RegisterData {
  objectId: string;
  category: string;
  scope: Scope;
  value: JsonValue;
  labels: DataLabels;
  inputs: DataReference[];
}
export function createDataService(deps: DataDependencies) {
  const resolvers = new Map(deps.resolvers?.map((resolver) => [resolver.ownerPlugin, resolver]));
  if ((deps.resolvers?.length ?? 0) !== resolvers.size || resolvers.has('orchestration'))
    throw new Error('Duplicate data resolver');
  const event = (
    context: OperationContext,
    action: string,
    objectId: string,
    outcome: AuditEvent['outcome'],
    details: AuditEvent['details'] = {},
  ): AuditEvent => ({
    version: 1,
    eventId: newId('evt'),
    actor: context.actor,
    action,
    objectType: 'data-reference',
    objectId,
    occurredAt: new Date().toISOString(),
    outcome,
    details,
  });
  function contextFor(input: OperationContext, scope: Scope, uri: string, permission: string): OperationContext {
    const original = operationContextSchema.parse(input);
    if (
      (original.actor.actorKind === 'agent' && !original.actor.authorizationId) ||
      !containsScope(original.scope, scope)
    )
      throw new DataAccessError();
    return operationContextSchema.parse({
      ...original,
      permission,
      scope,
      object: { type: 'data-reference', id: uri },
    });
  }
  async function check(context: OperationContext, refs: readonly DataReference[], channel: string) {
    if (!(await deps.authorize(context)).allowed) throw new DataCheckFailure('authorization-denied');
    if (!(await deps.policy(context, refs, channel)).allowed) throw new DataCheckFailure('policy-denied');
    if (
      refs.some(
        (ref) =>
          ref.orgId !== context.actor.orgId ||
          !ref.labels.readScopes.some((scope) => containsScope(scope, context.scope)),
      )
    )
      throw new DataCheckFailure('reference-scope-denied');
    if (refs.some((ref) => ref.labels.excludedChannels.includes(channel)))
      throw new DataCheckFailure('channel-excluded');
  }
  async function boundary<T>(
    input: OperationContext,
    action: string,
    uri: string,
    work: () => Promise<T>,
    details: AuditEvent['details'] = {},
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const reason = error instanceof DataCheckFailure ? error.reason : 'access-or-integrity-failed';
      // Never store body, raw exceptions, URLs, paths or credentials in access errors/audit.
      const parsed = operationContextSchema.safeParse(input);
      if (parsed.success) {
        try {
          const safeObject = referenceUriSchema.safeParse(uri).success
            ? uri
            : createHash('sha256').update(uri).digest('hex');
          await deps.audit(
            event(parsed.data, action, safeObject, reason === 'outbound-effect-failed' ? 'failed' : 'denied', {
              ...details,
              reason,
            }),
          );
        } catch {
          /* Deny even when the audit sink fails; never expose its raw error. */
        }
      }
      // Adapter causes may contain credentials or private payloads; expose only the stable public error.
      throw new DataAccessError();
    }
  }
  async function read(request: ProtectedRead): Promise<{ ref: DataReference; value: JsonValue }> {
    return boundary(request.context, 'orchestration.data.read', request.ref.id, async () => {
      const supplied = dataReferenceSchema.parse(request.ref);
      if (supplied.orgId !== request.context.actor.orgId) throw new DataAccessError();
      if (supplied.ownerPlugin !== 'orchestration') {
        const resolver = resolvers.get(supplied.ownerPlugin);
        if (!resolver) throw new DataAccessError();
        const context = contextFor(request.context, request.context.scope, supplied.id, 'work.view');
        await check(context, [supplied], 'internal');
        await deps.audit(event(context, 'orchestration.data.read-intent', supplied.id, 'allowed'));
        const result = await resolver.resolve(context, supplied.id);
        if (canonicalData(result.ref) !== canonicalData(supplied)) throw new DataAccessError();
        const value = jsonValueSchema.parse(result.value);
        const digest = createHash('sha256').update(canonicalData(value)).digest('hex');
        if (referenceVersion(digest, result.ref.labels) !== result.ref.versionHash) throw new DataAccessError();
        await check(context, [result.ref], 'internal');
        return { ref: dataReferenceSchema.parse(result.ref), value };
      }
      const object = await deps.repository.find(supplied.orgId, request.context.actor.actorId, supplied.id);
      if (!object || canonicalData(object.ref) !== canonicalData(supplied)) throw new DataAccessError();
      const context = contextFor(request.context, object.scope, supplied.id, 'work.view');
      await check(context, [object.ref], 'internal');
      await deps.audit(event(context, 'orchestration.data.read-intent', supplied.id, 'allowed'));
      const bytes = await deps.storage.get(object.contentHash);
      if (
        !bytes ||
        bytes.byteLength !== object.byteLength ||
        createHash('sha256').update(bytes).digest('hex') !== object.contentHash ||
        referenceVersion(object.contentHash, object.ref.labels) !== object.ref.versionHash
      )
        throw new DataAccessError();
      const value = jsonValueSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      await check(context, [object.ref], 'internal');
      return { ref: object.ref, value };
    });
  }
  async function publish(
    context: OperationContext,
    request: RegisterData,
    labels: DataLabels,
    permission = 'work.create',
  ): Promise<DataReference> {
    const scope = scopeSchema.parse(request.scope),
      normalized = normalizeLabels(labels);
    if (
      !isId('obj', request.objectId) ||
      !/^[a-z][a-z0-9-]*$/.test(request.category) ||
      normalized.readScopes.some((s) => !containsScope(scope, s))
    )
      throw new DataAccessError();
    const bytes = new TextEncoder().encode(canonicalData(jsonValueSchema.parse(request.value)));
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const versionHash = referenceVersion(contentHash, normalized);
    const ref = dataReferenceSchema.parse({
      version: 1,
      id: `ref://orchestration/${request.category}/${request.objectId}@${versionHash}`,
      orgId: scope.orgId,
      ownerPlugin: 'orchestration',
      versionHash,
      labels: normalized,
    });
    const operation = contextFor(context, scope, ref.id, permission);
    await check(operation, [ref], 'internal');
    await deps.storage.put(contentHash, bytes);
    const stored = await deps.storage.get(contentHash);
    if (!stored || createHash('sha256').update(stored).digest('hex') !== contentHash) throw new DataAccessError();
    await check(operation, [ref], 'internal');
    const object: DataObject = {
      ref,
      objectId: request.objectId,
      category: request.category,
      scope,
      contentHash,
      byteLength: bytes.byteLength,
      inputRefs: request.inputs.map((input) => input.id),
    };
    await deps.repository.insert(
      operation,
      object,
      event(operation, 'orchestration.data.registered', ref.id, 'allowed', { versionHash }),
    );
    return ref;
  }
  async function register(context: OperationContext, input: RegisterData): Promise<DataReference> {
    return boundary(context, 'orchestration.data.register', input.objectId, async () => {
      // Snapshot before any adapter await: an attestation must bind the exact bytes eventually published.
      const request: RegisterData = {
        objectId: input.objectId,
        category: input.category,
        scope: scopeSchema.parse(input.scope),
        value: jsonValueSchema.parse(JSON.parse(canonicalData(jsonValueSchema.parse(input.value)))),
        labels: dataLabelsSchema.parse(input.labels),
        inputs: input.inputs.map((ref) => dataReferenceSchema.parse(ref)),
      };
      context = operationContextSchema.parse(context);
      const inputs = await Promise.all(request.inputs.map((ref) => read({ context, ref })));
      const requested = dataLabelsSchema.parse(request.labels);
      const trusted =
        context.actor.actorKind !== 'agent' &&
        (requested.source.kind === 'system' || requested.source.kind === 'trusted_source') &&
        (await deps.trustedProducer(context, {
          source: requested.source,
          contentHash: createHash('sha256')
            .update(canonicalData(jsonValueSchema.parse(request.value)))
            .digest('hex'),
          labels: normalizeLabels(requested),
          inputRefs: inputs.map((input) => input.ref.id),
        }));
      const labels = derivedLabels(
        requested,
        inputs.map((input) => input.ref),
        trusted,
      );
      return publish(context, request, labels);
    });
  }
  async function confirm(context: OperationContext, ref: DataReference, headCommit: string): Promise<DataReference> {
    return boundary(context, 'orchestration.data.confirm', ref.id, async () => {
      if (context.actor.actorKind !== 'member') throw new DataAccessError();
      const original = await read({ context, ref });
      const object = await deps.repository.find(ref.orgId, context.actor.actorId, ref.id);
      if (!object || ref.ownerPlugin !== 'orchestration') throw new DataAccessError();
      const proof = await deps.confirmation(context, original.ref, headCommit);
      if (
        proof.memberId !== context.actor.actorId ||
        proof.headCommit !== headCommit ||
        proof.originalRef !== ref.id ||
        !proof.basis ||
        !['spec.approve_requirements', 'spec.approve_design', 'pr.review'].includes(proof.permission)
      )
        throw new DataAccessError();
      return publish(
        context,
        {
          objectId: object.objectId,
          category: object.category,
          scope: object.scope,
          value: original.value,
          labels: original.ref.labels,
          inputs: [original.ref],
        },
        {
          ...original.ref.labels,
          trust: 'confirmed',
          confirmation: {
            kind: 'human',
            memberId: proof.memberId,
            headCommit: proof.headCommit,
            originalRef: proof.originalRef,
            basis: proof.basis,
          },
        },
        proof.permission,
      );
    });
  }
  /** Refuse only this action; the caller's independent branches retain their own outcomes. */
  async function outbound<T>(
    context: OperationContext,
    refs: DataReference[],
    channel: string,
    send: (values: readonly { ref: DataReference; value: JsonValue }[]) => Promise<T>,
  ): Promise<T> {
    return boundary(
      context,
      'orchestration.data.outbound',
      context.object.id,
      async () => {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(channel) || channel === 'internal') throw new DataAccessError();
        const values = await Promise.all(refs.map((ref) => read({ context, ref })));
        const operation = contextFor(context, context.scope, context.object.id, context.permission);
        await check(
          operation,
          values.map((value) => value.ref),
          channel,
        );
        await deps.audit(
          event(operation, 'orchestration.data.outbound-intent', context.object.id, 'allowed', {
            references: values.map((value) => value.ref.id),
            channel,
          }),
        );
        await check(
          operation,
          values.map((value) => value.ref),
          channel,
        );
        try {
          return await send(values);
        } catch {
          throw new DataCheckFailure('outbound-effect-failed');
        }
      },
      { references: refs.filter((ref) => referenceUriSchema.safeParse(ref.id).success).map((ref) => ref.id) },
    );
  }
  return { register, read, confirm, outbound };
}
