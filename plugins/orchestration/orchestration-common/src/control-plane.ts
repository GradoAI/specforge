import { z } from 'zod';
import {
  actorContextSchema,
  scopeSchema,
  dataReferenceSchema,
  contractIdSchema,
  contractVersionSchema,
  jsonValueSchema,
  problemSchema,
} from '@fasrun/contracts-core';
export const agentCallSchema = z
  .strictObject({
    version: contractVersionSchema,
    callId: contractIdSchema,
    orgId: contractIdSchema,
    workId: contractIdSchema,
    stepRunId: contractIdSchema,
    attempt: z.number().int().positive(),
    authorizationId: contractIdSchema,
    actor: actorContextSchema,
    inputRefs: z.array(dataReferenceSchema),
    allowedReadScopes: z.array(scopeSchema),
    allowedWriteScopes: z.array(scopeSchema),
    outputSchemaVersion: contractIdSchema,
    deadline: z.iso.datetime(),
    implementationId: contractIdSchema,
  })
  .superRefine((call, ctx) => {
    if (call.actor.orgId !== call.orgId || call.actor.authorizationId !== call.authorizationId)
      ctx.addIssue({ code: 'custom', message: 'Actor authorization does not match call', path: ['actor'] });
    if (
      [...call.inputRefs, ...call.allowedReadScopes, ...call.allowedWriteScopes].some(
        (value) => value.orgId !== call.orgId,
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Call scope crosses organization', path: ['orgId'] });
  });
const resultIdentity = {
  version: contractVersionSchema,
  callId: contractIdSchema,
  attempt: z.number().int().positive(),
  implementationId: contractIdSchema,
};
export const agentResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...resultIdentity,
    status: z.literal('success'),
    outputRefs: z.array(dataReferenceSchema),
    output: jsonValueSchema,
    replanRequested: z.boolean(),
    usage: z
      .strictObject({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() })
      .optional(),
  }),
  z.strictObject({ ...resultIdentity, status: z.literal('failed'), error: problemSchema }),
  z.strictObject({ ...resultIdentity, status: z.literal('cancelled'), reason: z.string() }),
]);
export const workStateSchema = z.enum([
  'received',
  'clarifying',
  'drafting',
  'waiting_review',
  'waiting_merge',
  'spec_confirmed',
  'needs_human',
]);
export const workSchema = z.strictObject({
  version: contractVersionSchema,
  id: contractIdSchema,
  orgId: contractIdSchema,
  authorizationId: contractIdSchema,
  state: workStateSchema,
  revision: z.number().int().positive(),
  paused: z.boolean(),
  cancelled: z.boolean(),
});
export type AgentCall = z.infer<typeof agentCallSchema>;
export type AgentResult = z.infer<typeof agentResultSchema>;
export type Work = z.infer<typeof workSchema>;
export interface PlanRequest {
  version: 1;
  workId: string;
  actor: z.infer<typeof actorContextSchema>;
  trustedInputs: readonly z.infer<typeof dataReferenceSchema>[];
  workflowVersion: string;
  policyVersion: string;
}
/** The plan is a schema-validated JSON document in T012, never an executable callback. */
export interface PlanDocument {
  version: 1;
  document: z.infer<typeof jsonValueSchema>;
}
