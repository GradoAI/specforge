import { testPool, closeTestPools } from '../test-pools.js';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type pg from 'pg';
import { beforeAll, afterAll, describe, it, expect, inject } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import { migrateDatabase } from '@fasrun/backend-defaults';
import { newId } from '@fasrun/contracts-core';
import { createKeycloakProvider } from './keycloak.js';
import { createIdentityRepository } from '../repository.js';
import { createIdentityService } from '../../application/identity.js';
class LoopbackContainer extends GenericContainer {
  protected override beforeContainerCreated(): Promise<void> {
    for (const bindings of Object.values(
      (this.hostConfig.PortBindings as Record<string, { HostIp?: string }[]> | undefined) ?? {},
    ))
      for (const binding of bindings) binding.HostIp = '127.0.0.1';
    return Promise.resolve();
  }
}
const orgId = newId('org'),
  memberId = newId('mem'),
  subject = randomUUID(),
  password = randomBytes(24).toString('base64url'),
  redirectUri = 'http://127.0.0.1/callback';
const request = { orgId, clientId: 'fasrun-browser', source: 'http' as const, traceId: 'keycloak-trace' };
const realm = {
  realm: 't006',
  enabled: true,
  sslRequired: 'none',
  clients: [
    {
      clientId: 'fasrun-browser',
      enabled: true,
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      redirectUris: [redirectUri],
      webOrigins: ['http://127.0.0.1'],
      attributes: { 'pkce.code.challenge.method': 'S256' },
      protocolMappers: [
        {
          name: 'audience',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-audience-mapper',
          config: { 'included.custom.audience': 'fasrun-api', 'access.token.claim': 'true' },
        },
      ],
    },
  ],
  users: [
    {
      id: subject,
      username: 'test-member',
      enabled: true,
      emailVerified: true,
      email: 'test@example.test',
      firstName: 'Test',
      lastName: 'Member',
      credentials: [{ type: 'password', value: password, temporary: false }],
    },
  ],
};
describe('TC-SF5-IDENTITY-001/002 real Keycloak authorization code and rejection', () => {
  let container: StartedTestContainer | undefined,
    database: TestDatabase | undefined,
    pool: pg.Pool,
    issuer: string,
    provider: ReturnType<typeof createKeycloakProvider>,
    service: ReturnType<typeof createIdentityService>,
    repository: ReturnType<typeof createIdentityRepository>;
  beforeAll(async () => {
    container = await new LoopbackContainer('quay.io/keycloak/keycloak:26.8.2')
      .withCommand(['start-dev', '--import-realm'])
      .withEnvironment({ KC_HTTP_ENABLED: 'true', KC_HOSTNAME_STRICT: 'false', JAVA_OPTS_APPEND: '-Xms256m -Xmx512m' })
      .withExposedPorts(8080)
      .withCopyContentToContainer([
        { content: JSON.stringify(realm), target: '/opt/keycloak/data/import/t006-realm.json' },
      ])
      .withWaitStrategy(Wait.forLogMessage(/Listening on:/))
      .withStartupTimeout(180000)
      .start();
    issuer = `http://127.0.0.1:${container.getMappedPort(8080)}/realms/t006`;
    provider = createKeycloakProvider({
      issuer,
      audience: 'fasrun-api',
      clientId: 'fasrun-browser',
      redirectUri,
      allowLoopbackHttp: true,
    });
    database = await createTestDatabase(inject('fasrunPostgres'));
    await migrateDatabase({
      connectionString: database.ownerUrl,
      plugins: [
        { schema: 'identity', migrationsDirectory: fileURLToPath(new URL('../../../migrations/', import.meta.url)) },
      ],
    });
    pool = testPool({ connectionString: database.appUrl, max: 1 });
    repository = createIdentityRepository(pool);
    await repository.transaction(orgId, 'fixture', (s) =>
      s.putMember({ id: memberId, orgId, active: true, issuer, subject, sessionVersion: 1, teamIds: [], groupIds: [] }),
    );
    service = createIdentityService({
      repository,
      provider,
      origin: 'https://fasrun.example.test',
      clock: () => new Date(),
      audit: { record: () => Promise.resolve() },
      facts: () => Promise.reject(new Error('No policy facts required in login')),
      admission: () => Promise.reject(new Error('No admission in login')),
      policyVersion: () => Promise.resolve('v1'),
      policyAllows: () => Promise.resolve(true),
    });
  }, 240000);
  afterAll(async () => {
    try {
      await closeTestPools(pool);
    } finally {
      try {
        await database?.drop();
      } finally {
        await container?.stop();
      }
    }
  });
  async function login(url: string) {
    const page = await fetch(url, { redirect: 'manual' });
    const html = await page.text();
    const action = /action="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
    if (!action) throw new Error(`Keycloak login form unavailable (${page.status})`);
    const cookie = page.headers
      .getSetCookie()
      .map((x) => x.split(';')[0])
      .join('; ');
    const response = await fetch(action, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'test-member', password }),
    });
    const location = response.headers.get('location');
    if (!location) throw new Error(`Keycloak authorization redirect unavailable (${response.status})`);
    const result = new URL(location);
    return { state: result.searchParams.get('state')!, code: result.searchParams.get('code')! };
  }
  it('uses PKCE, nonce and browser-bound one-time state then persists only session digest', async () => {
    const start = await service.beginLogin(orgId),
      browser = start.browserCookie.split('=')[1]!.split(';')[0]!;
    expect(start.browserCookie).toContain('HttpOnly; Secure; SameSite=Lax');
    const code = await login(start.url);
    await expect(service.completeLogin({ ...code, browserCookie: 'different-browser', request })).rejects.toThrow();
    const result = await service.completeLogin({ ...code, browserCookie: browser, request });
    expect(result.actor.actorId).toBe(memberId);
    expect(result.cookie).toContain('HttpOnly; Secure; SameSite=Lax');
    await expect(service.completeLogin({ ...code, browserCookie: browser, request })).rejects.toThrow();
    const session = result.cookie.split('=')[1]!.split(';')[0]!;
    expect((await service.authenticateSession(session, { ...request, method: 'GET' })).actorId).toBe(memberId);
    await expect(
      service.authenticateSession(session, {
        ...request,
        method: 'POST',
        origin: 'https://other.example.test',
        csrf: result.csrf,
      }),
    ).rejects.toThrow();
    await expect(
      service.authenticateSession(session, {
        ...request,
        method: 'POST',
        origin: 'https://fasrun.example.test',
        csrf: 'wrong',
      }),
    ).rejects.toThrow();
    expect(
      (
        await service.authenticateSession(session, {
          ...request,
          method: 'POST',
          origin: 'https://fasrun.example.test',
          csrf: result.csrf,
        })
      ).actorId,
    ).toBe(memberId);
    await service.logout(
      { actor: result.actor, scope: { orgId }, permission: 'work.view', object: { type: 'member', id: memberId } },
      session,
    );
    await expect(service.authenticateSession(session, { ...request, method: 'GET' })).rejects.toThrow();
  });
  it('rejects real signed tokens with wrong audience, issuer, expiry and forged algorithm; HTTP/MCP share verification', async () => {
    const verifier = randomBytes(32).toString('base64url'),
      nonce = randomUUID();
    const code = await login(
      provider.authorizationUrl({
        state: 'token-test',
        nonce,
        challenge: createHash('sha256').update(verifier).digest('base64url'),
      }),
    );
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'fasrun-browser',
        code: code.code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
    const tokens = (await response.json()) as { access_token: string; id_token: string };
    expect(response.ok).toBe(true);
    expect((await service.authenticateContext(tokens.access_token, request)).actorId).toBe(memberId);
    expect((await service.authenticateContext(tokens.access_token, { ...request, source: 'mcp' })).actorId).toBe(
      memberId,
    );
    for (const options of [
      { audience: 'other' },
      { issuer: `${issuer}-wrong` },
      { clock: () => new Date(Date.now() + 7200000) },
    ]) {
      const invalid = createKeycloakProvider({
        issuer,
        audience: 'fasrun-api',
        clientId: 'fasrun-browser',
        redirectUri,
        allowLoopbackHttp: true,
        ...options,
      });
      await expect(invalid.verify(tokens.access_token)).rejects.toThrow('authentication failed');
    }
    await expect(provider.verify(tokens.id_token)).rejects.toThrow();
    const pieces = tokens.access_token.split('.');
    pieces[0] = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    await expect(provider.verify(pieces.join('.'))).rejects.toThrow();
    await repository.transaction(orgId, memberId, async (s) => {
      const member = await s.member(memberId);
      await s.putMember({ ...member!, active: false, sessionVersion: 2 });
    });
    await expect(service.authenticateContext(tokens.access_token, request)).rejects.toThrow();
  });
  it('rejects changed nonce and PKCE verifier against the real authorization server', async () => {
    await repository.transaction(orgId, memberId, async (s) => {
      const member = await s.member(memberId);
      await s.putMember({ ...member!, active: true });
    });
    const start = await service.beginLogin(orgId),
      browser = start.browserCookie.split('=')[1]!.split(';')[0]!,
      url = new URL(start.url);
    url.searchParams.set('nonce', 'attacker-nonce');
    const code = await login(url.href);
    await expect(service.completeLogin({ ...code, browserCookie: browser, request })).rejects.toThrow();
    const verifier = randomBytes(32).toString('base64url'),
      wrong = await login(
        provider.authorizationUrl({
          state: 'wrong-pkce',
          nonce: 'nonce',
          challenge: createHash('sha256').update(verifier).digest('base64url'),
        }),
      );
    await expect(provider.exchange(wrong.code, 'wrong-verifier')).rejects.toThrow();
  });
});
