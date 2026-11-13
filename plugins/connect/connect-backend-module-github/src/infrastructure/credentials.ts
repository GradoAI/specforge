import { sign, createPrivateKey } from 'node:crypto';
import { z } from 'zod';
import { GitHubFailure, rateDeadline } from './http.js';
import type { GitHubRepositoryRoute } from '@fasrun/plugin-connect-node';
import type { GitHubCredentials } from '../application/ports.js';
function unavailable(): never {
  throw new Error('GitHub credential operation unavailable');
}
const secretSchema = z.strictObject({ privateKey: z.string().min(1), webhookSecret: z.string().min(32) });
/** The source is T008 gateway.useCredential adapted by the trusted host; it reads the current encrypted
 * envelope on every use. App private key and webhook secret never enter CORE or returned configuration. */
export function createGitHubCredentials(options: {
  appId: string;
  routes: readonly GitHubRepositoryRoute[];
  useSecret<T>(route: GitHubRepositoryRoute, consume: (secret: Buffer) => Promise<T>): Promise<T>;
  fetch?: typeof fetch;
  clock?: () => Date;
  apiOrigin?: string;
  allowLocalFixture?: boolean;
}): GitHubCredentials {
  if (!/^[1-9][0-9]*$/.test(options.appId)) throw new Error('Invalid GitHub App ID');
  const origin = new URL(options.apiOrigin ?? 'https://api.github.com');
  if (
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    (origin.href !== 'https://api.github.com/' &&
      !(options.allowLocalFixture === true && origin.protocol === 'http:' && origin.hostname === '127.0.0.1'))
  )
    throw new Error('Unapproved token endpoint');
  const routes = structuredClone(options.routes),
    request = options.fetch ?? fetch;
  function bound(route: GitHubRepositoryRoute) {
    const matches = routes.filter(
      (r) =>
        r.installationId === route.installationId &&
        r.repositoryId === route.repositoryId &&
        r.integrationId === route.integrationId &&
        r.scope.orgId === route.scope.orgId,
    );
    if (matches.length !== 1) throw new Error('Credential route rejected');
    return matches[0]!;
  }
  return {
    async use<T>(route: GitHubRepositoryRoute, consume: (token: string) => Promise<T>): Promise<T> {
      const actual = bound(route);
      try {
        const result = await options.useSecret<{ ok: true; value: T } | { ok: false; error: GitHubFailure }>(
          actual,
          async (buffer) => {
            try {
              const secret = secretSchema.parse(JSON.parse(buffer.toString('utf8'))),
                key = createPrivateKey(secret.privateKey);
              if (key.asymmetricKeyType !== 'rsa') throw new Error('Invalid signing key');
              const now = Math.floor((options.clock?.() ?? new Date()).getTime() / 1000),
                encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
              const body = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: options.appId })}`;
              const jwt = `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
              if (
                !/^[1-9][0-9]*$/.test(actual.installationId) ||
                !/^[1-9][0-9]*$/.test(actual.repositoryId) ||
                !Number.isSafeInteger(Number(actual.repositoryId))
              )
                throw new Error('Invalid immutable route IDs');
              const response = await request(
                new URL(`/app/installations/${actual.installationId}/access_tokens`, origin),
                {
                  method: 'POST',
                  redirect: 'error',
                  signal: AbortSignal.timeout(15000),
                  headers: {
                    authorization: `Bearer ${jwt}`,
                    accept: 'application/vnd.github+json',
                    'content-type': 'application/json',
                    'x-github-api-version': '2026-03-10',
                  },
                  body: JSON.stringify({
                    repository_ids: [Number(actual.repositoryId)],
                    permissions: { issues: 'write', pull_requests: 'write', contents: 'write' },
                  }),
                },
              );
              if (
                response.status === 429 ||
                (response.status === 403 &&
                  (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))
              ) {
                throw new GitHubFailure(
                  'rate_limited',
                  new Date(rateDeadline(response.headers, now * 1000)).toISOString(),
                  true,
                );
              }
              if (response.status === 401 || response.status === 403)
                throw new GitHubFailure('permission', undefined, true);
              if (!response.ok) throw new GitHubFailure('unavailable');
              const value = z
                .object({
                  token: z.string().min(1),
                  expires_at: z.iso.datetime(),
                  repositories: z.array(z.object({ id: z.number().int().positive() })).optional(),
                })
                .parse(await response.json());
              if (
                Date.parse(value.expires_at) <= now * 1000 ||
                Date.parse(value.expires_at) > (now + 3660) * 1000 ||
                value.repositories?.some((r) => String(r.id) !== actual.repositoryId)
              )
                throw new Error('Invalid token scope or expiry');
              return { ok: true, value: await consume(value.token) };
            } catch (error) {
              // T008 gateway redacts thrown callback errors. Carry only our fixed safe classification as a value.
              if (error instanceof GitHubFailure) return { ok: false, error };
              return unavailable();
            }
          },
        );
        if (!result.ok) throw result.error;
        return result.value;
      } catch (error) {
        if (error instanceof GitHubFailure) throw error;
        return unavailable();
      }
    },
    async webhookSecret(installationId, consume) {
      try {
        const matching = routes.filter((r) => r.installationId === installationId);
        if (!matching.length || new Set(matching.map((r) => r.integrationId)).size !== 1)
          throw new Error('Unknown installation');
        return await options.useSecret(matching[0]!, (buffer) =>
          Promise.resolve().then(() => {
            const secret = secretSchema.parse(JSON.parse(buffer.toString('utf8')));
            const key = Buffer.from(secret.webhookSecret);
            try {
              return consume(key);
            } finally {
              key.fill(0);
            }
          }),
        );
      } catch {
        throw new Error('GitHub webhook credential unavailable');
      }
    },
  };
}
