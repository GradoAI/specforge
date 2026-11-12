import { z } from 'zod';
import { actorContextSchema, contractIdSchema, contractVersionSchema, jsonValueSchema } from '@fasrun/contracts-core';
export const auditEventSchema = z.strictObject({
  version: contractVersionSchema,
  eventId: contractIdSchema,
  actor: actorContextSchema,
  action: contractIdSchema,
  objectType: contractIdSchema,
  objectId: contractIdSchema,
  occurredAt: z.iso.datetime(),
  outcome: z.enum(['allowed', 'denied', 'failed']),
  details: z.record(z.string(), jsonValueSchema),
});
export const policySnapshotSchema = z.strictObject({
  version: contractVersionSchema,
  id: contractIdSchema,
  orgId: contractIdSchema,
  policyVersion: contractIdSchema,
  constraints: z.record(z.string(), jsonValueSchema),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type PolicySnapshot = z.infer<typeof policySnapshotSchema>;
