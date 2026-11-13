import { z } from 'zod';
import { contractIdSchema as id, scopeSchema } from '@fasrun/contracts-core';
export const integrationSchema = z.strictObject({
  id,
  orgId: id,
  installationId: id,
  provider: z.literal('github'),
  active: z.boolean(),
});
export const repositoryBindingSchema = z.strictObject({
  id,
  integrationId: id,
  repositoryId: id,
  scope: scopeSchema.extend({ teamId: id, projectId: id }),
  active: z.boolean(),
});
const encoded = z
  .string()
  .min(1)
  .max(131072)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const credentialEnvelopeSchema = z.strictObject({
  version: z.literal(1),
  orgId: id,
  integrationId: id,
  keyVersion: id,
  credentialVersion: id,
  algorithm: z.literal('AES-256-GCM'),
  nonce: encoded,
  ciphertext: encoded,
  tag: encoded,
  wrappingNonce: encoded,
  wrappedKey: encoded,
  wrappingTag: encoded,
});
export const externalObjectSchema = z.strictObject({
  id,
  integrationId: id,
  repositoryId: id,
  externalId: id,
  kind: z.enum(['issue', 'pull_request', 'review', 'discussion']),
  observedAt: z.iso.datetime(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Integration = z.infer<typeof integrationSchema>;
export type RepositoryBinding = z.infer<typeof repositoryBindingSchema>;
export type CredentialEnvelope = z.infer<typeof credentialEnvelopeSchema>;
export type ExternalObject = z.infer<typeof externalObjectSchema>;
