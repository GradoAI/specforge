import { z } from 'zod';
import { contractIdSchema, contractVersionSchema, dataReferenceSchema } from '@fasrun/contracts-core';
export const inboxEventSchema = z
  .strictObject({
    version: contractVersionSchema,
    orgId: contractIdSchema,
    installationId: contractIdSchema,
    deliveryId: contractIdSchema,
    externalObjectId: contractIdSchema,
    eventType: contractIdSchema,
    receivedAt: z.iso.datetime(),
    signatureVerified: z.literal(true),
    payloadRef: dataReferenceSchema,
  })
  .refine((value) => value.payloadRef.orgId === value.orgId, {
    message: 'Event reference crosses organization',
    path: ['payloadRef'],
  });
export const inboxReceiptSchema = z.strictObject({
  version: contractVersionSchema,
  receiptId: contractIdSchema,
  deliveryId: contractIdSchema,
  persistedAt: z.iso.datetime(),
});
export const externalActionSchema = z.strictObject({
  version: contractVersionSchema,
  actionId: contractIdSchema,
  idempotencyKey: contractIdSchema,
  requestHash: contractIdSchema,
  integrationId: contractIdSchema,
  kind: z.enum(['comment', 'update_comment', 'create_spec_pr']),
  targetId: contractIdSchema,
  payloadRef: dataReferenceSchema,
});
export const actionResultSchema = z.strictObject({
  version: contractVersionSchema,
  actionId: contractIdSchema,
  status: z.enum(['pending', 'succeeded', 'failed', 'unknown']),
  externalId: contractIdSchema.optional(),
  retryAt: z.iso.datetime().optional(),
});
export type InboxEvent = z.infer<typeof inboxEventSchema>;
export type InboxReceipt = z.infer<typeof inboxReceiptSchema>;
export type ExternalAction = z.infer<typeof externalActionSchema>;
export type ActionResult = z.infer<typeof actionResultSchema>;
