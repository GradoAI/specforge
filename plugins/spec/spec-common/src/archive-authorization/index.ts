import { z } from 'zod';
import { operationContextSchema, type OperationContext } from '@fasrun/contracts-core';
import { repositoryPathSchema } from '../config/index.js';

export const archiveBindingSchema = z.strictObject({
  repositoryId: z.string().min(1),
  repositoryRoot: z.string().min(1),
  specRoot: repositoryPathSchema,
  change: repositoryPathSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const entrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('directory'), path: repositoryPathSchema }),
  z.strictObject({ kind: z.literal('file'), path: repositoryPathSchema, bytes: z.string() }),
]);
export const archiveOperationSchema = z.strictObject({
  version: z.literal(1),
  binding: archiveBindingSchema,
  /** Complete spec-root snapshot, including empty directories and binary/non-Markdown attachments. */
  inputs: z.array(entrySchema),
  actions: z
    .array(
      z.discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('write'), path: repositoryPathSchema, text: z.string() }),
        z.strictObject({ kind: z.literal('move'), from: repositoryPathSchema, to: repositoryPathSchema }),
      ]),
    )
    .min(1),
});
export type ArchiveBinding = z.infer<typeof archiveBindingSchema>;
export type ArchiveOperation = z.infer<typeof archiveOperationSchema>;
export const archiveApprovalSchema = z.strictObject({
  authorizationId: z.string().min(1),
  context: operationContextSchema,
  operationDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ArchiveApproval = z.infer<typeof archiveApprovalSchema>;
/** Trusted host adapter over existing identity/authorization ports, never deserialized from a request.
 * resolveContext authenticates and authorizes reading the actual repository/project/spec root.
 * authorize resolves the immutable authorization record and current revocation/role state, applies
 * the existing scope/capability intersection, and returns a projection bound to this exact digest.
 * It must not turn arbitrary caller JSON, a system actor or a boolean into an approval.
 */
export interface ArchiveAuthority {
  resolveContext(binding: ArchiveBinding): Promise<OperationContext>;
  authorize(
    context: OperationContext,
    operation: ArchiveOperation,
    digest: string,
  ): Promise<ArchiveApproval | undefined>;
}
/** Deterministic encoding; action order and every content byte are significant. No IO or implicit clock. */
export function encodeArchiveOperation(input: ArchiveOperation): string {
  return JSON.stringify(archiveOperationSchema.parse(input));
}
export function requireArchiveContext(input: unknown): OperationContext {
  const context = operationContextSchema.parse(input);
  if (!context.actor.authorizationId || !context.scope.projectId)
    throw new Error('Archive requires existing authorization and project scope');
  return context;
}
export function assertArchiveApproval(context: OperationContext, digest: string, input: unknown): void {
  const actor = requireArchiveContext(context);
  const approval = archiveApprovalSchema.parse(input);
  if (
    approval.authorizationId !== actor.actor.authorizationId ||
    JSON.stringify(approval.context) !== JSON.stringify(actor) ||
    approval.operationDigest !== digest
  )
    throw new Error('Archive authorization does not match the current actor and operation');
}
