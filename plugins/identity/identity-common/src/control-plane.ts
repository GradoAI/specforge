import { z } from 'zod';
import { actorContextSchema, scopeSchema, contractIdSchema, contractVersionSchema } from '@fasrun/contracts-core';
export const subjectSchema = z.strictObject({ id: contractIdSchema, kind: z.enum(['member', 'agent', 'service']) });
export const permissionSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
export const decisionSchema = z.strictObject({
  allowed: z.boolean(),
  matchedRuleIds: z.array(contractIdSchema),
  policyVersion: contractIdSchema,
  reason: z.string(),
});
export const authorizationSchema = z.strictObject({
  version: contractVersionSchema,
  id: contractIdSchema,
  intakeId: contractIdSchema,
  actor: actorContextSchema,
  scope: scopeSchema,
  requestStrength: z.enum(['explicit', 'candidate', 'proactive']),
  ruleIds: z.array(contractIdSchema),
  policyVersion: contractIdSchema,
});
export type Subject = z.infer<typeof subjectSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Authorization = z.infer<typeof authorizationSchema>;
