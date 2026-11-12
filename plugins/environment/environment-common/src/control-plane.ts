import { z } from 'zod';
import { contractIdSchema, contractVersionSchema } from '@fasrun/contracts-core';
export const environmentSnapshotSchema = z.strictObject({
  version: contractVersionSchema,
  orgId: contractIdSchema,
  templateId: contractIdSchema,
  templateVersion: contractIdSchema,
  allowedCapabilities: z.array(contractIdSchema),
});
export type EnvironmentSnapshot = z.infer<typeof environmentSnapshotSchema>;
