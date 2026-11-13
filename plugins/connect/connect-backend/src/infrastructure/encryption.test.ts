import { describe, it, expect } from 'vitest';
import { createCredentialCipher } from './encryption.js';
describe('TC-SF5-CONNECT-003 envelope encryption', () => {
  it('authenticates tenant, integration, version, ciphertext, wrapping and external key availability', async () => {
    const cipher = createCredentialCipher({ activeVersion: () => 'v1', key: () => Buffer.alloc(32, 7) });
    const secret = Buffer.from('fixture-only-secret'),
      expected = { orgId: 'org', integrationId: 'integration', credentialVersion: '1' };
    const value = cipher.encrypt(expected.orgId, expected.integrationId, expected.credentialVersion, secret);
    expect(await cipher.use(value, expected, (bytes) => Promise.resolve(bytes.equals(secret)))).toBe(true);
    for (const key of [
      'orgId',
      'integrationId',
      'credentialVersion',
      'keyVersion',
      'ciphertext',
      'tag',
      'nonce',
      'wrappingNonce',
      'wrappingTag',
      'wrappedKey',
    ] as const) {
      await expect(
        cipher.use(
          {
            ...value,
            [key]: key.endsWith('Id') || key.endsWith('Version') ? 'changed' : Buffer.alloc(12, 9).toString('base64'),
          },
          expected,
          () => Promise.resolve(true),
        ),
      ).rejects.toThrow('unavailable');
    }
    const wrong = createCredentialCipher({ activeVersion: () => 'v1', key: () => Buffer.alloc(32, 9) });
    await expect(wrong.use(value, expected, () => Promise.resolve(true))).rejects.toThrow('unavailable');
    let borrowed: Buffer | undefined;
    await cipher.use(value, expected, (bytes) => {
      borrowed = bytes;
      return Promise.resolve();
    });
    expect(borrowed?.every((b) => b === 0)).toBe(true);
    await expect(cipher.use(value, expected, () => Promise.reject(new Error('raw secret')))).rejects.toThrow(
      'Credential operation unavailable',
    );
    expect(() =>
      createCredentialCipher({ activeVersion: () => 'v1', key: () => Buffer.alloc(3) }).encrypt(
        'org',
        'i',
        '1',
        secret,
      ),
    ).toThrow('unavailable');
  });
});
