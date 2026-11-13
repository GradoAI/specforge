import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { credentialEnvelopeSchema, type CredentialEnvelope } from '@fasrun/plugin-connect-common';
/** Only the gateway holds this capability. Keys come from external Secrets, never CORE or persisted rows. */
export interface MasterKeySource {
  activeVersion(): string;
  key(version: string): Buffer;
}
export function createCredentialCipher(keys: MasterKeySource) {
  function aad(orgId: string, integrationId: string, keyVersion: string, credentialVersion: string) {
    return Buffer.from(
      JSON.stringify(['fasrun.connect.credentials.v1', orgId, integrationId, keyVersion, credentialVersion]),
    );
  }
  function seal(key: Buffer, plaintext: Buffer, associated: Buffer) {
    if (key.length !== 32) throw new Error('Invalid key');
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(associated);
    return {
      nonce: nonce.toString('base64'),
      ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }
  function open(key: Buffer, nonce: string, tag: string, ciphertext: string, associated: Buffer) {
    if (key.length !== 32 || Buffer.from(nonce, 'base64').length !== 12 || Buffer.from(tag, 'base64').length !== 16)
      throw new Error('Invalid envelope');
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
    cipher.setAAD(associated);
    cipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(ciphertext, 'base64')), cipher.final()]);
  }
  return {
    encrypt(orgId: string, integrationId: string, credentialVersion: string, plaintext: Buffer): CredentialEnvelope {
      let dataKey: Buffer | undefined;
      try {
        const keyVersion = keys.activeVersion(),
          associated = aad(orgId, integrationId, keyVersion, credentialVersion);
        dataKey = randomBytes(32);
        const encrypted = seal(dataKey, plaintext, associated),
          wrapped = seal(keys.key(keyVersion), dataKey, associated);
        return credentialEnvelopeSchema.parse({
          version: 1,
          algorithm: 'AES-256-GCM',
          orgId,
          integrationId,
          keyVersion,
          credentialVersion,
          ...encrypted,
          wrappingNonce: wrapped.nonce,
          wrappedKey: wrapped.ciphertext,
          wrappingTag: wrapped.tag,
        });
      } catch {
        throw new Error('Credential encryption unavailable');
      } finally {
        dataKey?.fill(0);
      }
    },
    async use<T>(
      input: CredentialEnvelope,
      expected: { orgId: string; integrationId: string; credentialVersion: string },
      consume: (plaintext: Buffer) => Promise<T>,
    ): Promise<T> {
      let key: Buffer | undefined, plaintext: Buffer | undefined;
      try {
        const envelope = credentialEnvelopeSchema.parse(input);
        if (
          envelope.orgId !== expected.orgId ||
          envelope.integrationId !== expected.integrationId ||
          envelope.credentialVersion !== expected.credentialVersion
        )
          throw new Error('Wrong credential');
        const associated = aad(envelope.orgId, envelope.integrationId, envelope.keyVersion, envelope.credentialVersion);
        key = open(
          keys.key(envelope.keyVersion),
          envelope.wrappingNonce,
          envelope.wrappingTag,
          envelope.wrappedKey,
          associated,
        );
        plaintext = open(key, envelope.nonce, envelope.tag, envelope.ciphertext, associated);
        return await consume(plaintext);
      } catch {
        throw new Error('Credential operation unavailable');
      } finally {
        key?.fill(0);
        plaintext?.fill(0);
      }
    },
  };
}
