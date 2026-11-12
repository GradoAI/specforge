import { z } from 'zod';
import { contractIdSchema, contractVersionSchema, dataReferenceSchema } from '@fasrun/contracts-core';
export const projectContextSchema = z.strictObject({
  version: contractVersionSchema,
  orgId: contractIdSchema,
  projectId: contractIdSchema,
  repositoryId: contractIdSchema,
  baseCommit: contractIdSchema,
  configRef: dataReferenceSchema,
  workflowVersion: contractIdSchema,
  templateVersion: contractIdSchema,
  policyVersion: contractIdSchema,
});
export type ProjectContext = z.infer<typeof projectContextSchema>;
