import { it, expect } from 'vitest';
import { credentialEnvelopeSchema, repositoryBindingSchema } from './state.js';
it('TC-SF5-CONNECT-003 wire credentials never accept plaintext or a persisted master key', () => {
  const value = {
    version: 1,
    algorithm: 'AES-256-GCM',
    orgId: 'org',
    integrationId: 'integration',
    keyVersion: 'key-v1',
    credentialVersion: 'v1',
    nonce: 'YQ==',
    ciphertext: 'YQ==',
    tag: 'YQ==',
    wrappingNonce: 'YQ==',
    wrappedKey: 'YQ==',
    wrappingTag: 'YQ==',
  };
  expect(credentialEnvelopeSchema.safeParse(value).success).toBe(true);
  expect(credentialEnvelopeSchema.safeParse({ ...value, plaintext: 'secret' }).success).toBe(false);
  expect(credentialEnvelopeSchema.safeParse({ ...value, masterKey: 'secret' }).success).toBe(false);
  expect(credentialEnvelopeSchema.safeParse({ ...value, version: 2 }).success).toBe(false);
  expect(
    repositoryBindingSchema.safeParse({
      id: 'binding',
      integrationId: 'integration',
      repositoryId: 'repo',
      scope: { orgId: 'org' },
      active: true,
    }).success,
  ).toBe(false);
});
