import { createServer, type Server } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKeycloakProvider } from './keycloak.js';

describe('TC-SF5-IDENTITY-001 fixed JWKS validation and rotation', () => {
  let server: Server, issuer: string, privateKey: CryptoKey;
  let keys: Record<string, unknown>[] = [];
  let body: unknown = {},
    status = 200;
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    keys = [{ ...(await exportJWK(pair.publicKey)), kid: 'first', alg: 'RS256' }];
    server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.statusCode = request.url?.endsWith('/certs') ? 200 : status;
      response.end(JSON.stringify(request.url?.endsWith('/certs') ? { keys } : body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener');
    issuer = `http://127.0.0.1:${address.port}/realms/test`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
  const provider = () =>
    createKeycloakProvider({
      issuer,
      audience: 'api',
      clientId: 'browser',
      redirectUri: 'https://fasrun.example.test/callback',
      allowLoopbackHttp: true,
    });
  async function signed(payload: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: issuer, aud: 'api', sub: 'subject', exp: now + 60, iat: now, typ: 'Bearer', ...payload })
      .setProtectedHeader({ alg: 'RS256', kid: 'first', ...header })
      .sign(privateKey);
  }
  it('rejects nbf, absent/expired claims, wrong issuer/audience, unsafe JOSE header and token class', async () => {
    const p = provider();
    expect((await p.verify(await signed())).subject).toBe('subject');
    for (const payload of [
      { nbf: Math.floor(Date.now() / 1000) + 600 },
      { exp: 1 },
      { iss: 'https://different.example.test' },
      { aud: 'other' },
      { sub: '' },
      { typ: 'ID' },
      { exp: undefined },
      { iat: undefined },
    ]) {
      await expect(p.verify(await signed(payload))).rejects.toThrow('Identity authentication failed');
    }
    for (const header of [
      { kid: 'absent' },
      { jku: 'https://attacker.example.test/keys' },
      { x5u: 'https://attacker.example.test/certificate' },
    ]) {
      await expect(p.verify(await signed({}, header))).rejects.toThrow('Identity authentication failed');
    }
    await expect(p.verify('not-a-jwt')).rejects.toThrow('Identity authentication failed');
    expect((await p.verify(await signed({ aud: 'browser', nonce: 'nonce', typ: 'ID' }), 'id')).nonce).toBe('nonce');
  });
  it('refreshes only the configured JWKS on an unknown rotated kid', async () => {
    const p = provider();
    await p.verify(await signed());
    const next = await generateKeyPair('RS256');
    keys.push({ ...(await exportJWK(next.publicKey)), kid: 'rotated', alg: 'RS256' });
    const now = Math.floor(Date.now() / 1000);
    const rotated = await new SignJWT({
      iss: issuer,
      aud: 'api',
      sub: 'subject',
      exp: now + 60,
      iat: now,
      typ: 'Bearer',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'rotated' })
      .sign(next.privateKey);
    expect((await p.verify(rotated)).subject).toBe('subject');
  });
  it('requires matching code-exchange token identities and redacts endpoint failures', async () => {
    const p = provider();
    body = { id_token: await signed({ aud: 'browser', typ: 'ID' }), access_token: await signed() };
    expect((await p.exchange('code', 'verifier')).identity.subject).toBe('subject');
    body = { id_token: await signed({ aud: 'browser' }), access_token: await signed({ sub: 'other' }) };
    await expect(p.exchange('code', 'verifier')).rejects.toThrow('Identity authentication failed');
    body = { error: 'credential-bearing failure' };
    await expect(p.exchange('code', 'verifier')).rejects.toThrow('Identity authentication failed');
    status = 401;
    await expect(p.exchange('code', 'verifier')).rejects.toThrow('Identity authentication failed');
  });
  it('rejects insecure trusted endpoint configurations', () => {
    const valid = {
      issuer: 'https://identity.example.test/realm',
      audience: 'api',
      clientId: 'browser',
      redirectUri: 'https://fasrun.example.test/callback',
    };
    for (const change of [
      { issuer: 'http://identity.example.test' },
      { redirectUri: 'http://fasrun.example.test' },
      { issuer: 'https://user:password@identity.example.test' },
      { issuer: valid.issuer + '?query=x' },
      { issuer: valid.issuer + '#hash' },
      { audience: '' },
      { clientId: '' },
    ])
      expect(() => createKeycloakProvider({ ...valid, ...change })).toThrow();
    expect(() => createKeycloakProvider(valid)).not.toThrow();
  });
});
