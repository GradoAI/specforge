import { z } from 'zod';
import { contractIdSchema, contractVersionSchema, dataReferenceSchema } from '@fasrun/contracts-core';
export const specLayerSchema = z.enum(['requirements', 'design', 'tasks']);
export const layerRevisionSchema = z.strictObject({
  version: contractVersionSchema,
  id: contractIdSchema,
  workId: contractIdSchema,
  layer: specLayerSchema,
  baseCommit: contractIdSchema,
  headCommit: contractIdSchema,
  schemaVersion: contractIdSchema,
  contentRef: dataReferenceSchema,
});
export const layerCheckSchema = z.strictObject({
  version: contractVersionSchema,
  revisionId: contractIdSchema,
  valid: z.boolean(),
  issues: z.array(z.strictObject({ path: z.string(), code: contractIdSchema, message: z.string() })),
});
export type SpecLayer = z.infer<typeof specLayerSchema>;
export type LayerRevision = z.infer<typeof layerRevisionSchema>;
export type LayerCheck = z.infer<typeof layerCheckSchema>;
