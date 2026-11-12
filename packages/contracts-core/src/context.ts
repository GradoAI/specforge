import { z } from 'zod';

/** Wire contracts are strict and explicitly versioned; authentication creates this context, never a request body. */
export const contractVersionSchema = z.literal(1);
export const contractIdSchema = z.string().min(1);
export const scopeSchema = z.strictObject({
  orgId: contractIdSchema,
  teamId: contractIdSchema.optional(),
  projectId: contractIdSchema.optional(),
});
export const actorContextSchema = z.strictObject({
  version: contractVersionSchema,
  actorId: contractIdSchema,
  actorKind: z.enum(['member', 'agent', 'service']),
  orgId: contractIdSchema,
  clientId: contractIdSchema,
  source: z.enum(['http', 'mcp', 'github', 'workflow', 'internal']),
  traceId: contractIdSchema,
  authorizationId: contractIdSchema.optional(),
});
export const operationContextSchema = z
  .strictObject({
    actor: actorContextSchema,
    permission: contractIdSchema,
    scope: scopeSchema,
    object: z.strictObject({ type: contractIdSchema, id: contractIdSchema }),
  })
  .refine((value) => value.actor.orgId === value.scope.orgId, {
    message: 'Actor and operation must belong to the same organization',
    path: ['scope', 'orgId'],
  });
/** URI version is the digest of canonical content AND labels; hashing is owned by T010. */
export const referenceUriSchema = z
  .string()
  .regex(/^ref:\/\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/[A-Za-z0-9_-]+@[a-f0-9]{64}$/);
export const confirmationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('human'),
    memberId: contractIdSchema,
    basis: contractIdSchema,
    originalRef: referenceUriSchema,
    headCommit: contractIdSchema,
  }),
  z.strictObject({ kind: z.literal('trusted_source'), sourceId: contractIdSchema, basis: contractIdSchema }),
]);
export const dataLabelsSchema = z
  .strictObject({
    trust: z.enum(['trusted', 'untrusted', 'confirmed']),
    source: z.strictObject({ kind: z.enum(['external', 'agent', 'system', 'trusted_source']), id: contractIdSchema }),
    readScopes: z.array(scopeSchema).min(1),
    classification: z.string().min(1),
    excludedChannels: z.array(contractIdSchema),
    confirmation: confirmationSchema.optional(),
  })
  .superRefine((labels, ctx) => {
    if ((labels.trust === 'confirmed') !== (labels.confirmation !== undefined))
      ctx.addIssue({
        code: 'custom',
        message: 'Only confirmed data carries mandatory confirmation evidence',
        path: ['confirmation'],
      });
  });
export const dataReferenceSchema = z
  .strictObject({
    version: contractVersionSchema,
    id: referenceUriSchema,
    orgId: contractIdSchema,
    ownerPlugin: z.string().regex(/^[a-z][a-z0-9-]*$/),
    versionHash: z.string().regex(/^[a-f0-9]{64}$/),
    labels: dataLabelsSchema,
  })
  .superRefine((ref, ctx) => {
    if (!ref.id.startsWith(`ref://${ref.ownerPlugin}/`) || !ref.id.endsWith(`@${ref.versionHash}`))
      ctx.addIssue({ code: 'custom', message: 'URI owner and version must match reference metadata', path: ['id'] });
    if (ref.labels.readScopes.some((scope) => scope.orgId !== ref.orgId))
      ctx.addIssue({
        code: 'custom',
        message: 'Reference read scope crosses organization',
        path: ['labels', 'readScopes'],
      });
  });
export const protectedReadSchema = z
  .strictObject({
    context: operationContextSchema,
    ref: dataReferenceSchema,
  })
  .refine((value) => value.context.actor.orgId === value.ref.orgId, {
    message: 'Cross-organization reference',
    path: ['ref', 'orgId'],
  });
export const problemSchema = z.strictObject({
  version: contractVersionSchema,
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: z.string().regex(/^(FASRUN_[A-Z0-9_]+|[a-z][a-z0-9-]*\.[a-z][a-z0-9_.-]*)$/),
  traceId: contractIdSchema,
  detail: z.string().optional(),
});
export type ActorContext = z.infer<typeof actorContextSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type OperationContext = z.infer<typeof operationContextSchema>;
export type DataLabels = z.infer<typeof dataLabelsSchema>;
export type DataReference = z.infer<typeof dataReferenceSchema>;
export type ProtectedRead = z.infer<typeof protectedReadSchema>;
export type Problem = z.infer<typeof problemSchema>;
/** JSON only: no database rows, Dates, executable values or transport credentials in public DTOs. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.json();
export interface MutationOptions {
  idempotencyKey: string;
  expectedVersion?: number;
}
