import type { GitHubRepositoryRoute } from '@fasrun/plugin-connect-node';
import type { GitHubCredentials } from '../application/ports.js';
export class GitHubFailure extends Error {
  constructor(
    readonly reason: 'rate_limited' | 'permission' | 'unavailable' | 'invalid_response',
    readonly retryAt?: string,
    readonly definite = false,
  ) {
    super(`GitHub ${reason}`);
  }
}
export function createGitHubHttp(options: {
  credentials: GitHubCredentials;
  fetch?: typeof fetch;
  clock?: () => Date;
  apiOrigin?: string;
  allowLocalFixture?: boolean;
}) {
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
    throw new Error('Unapproved GitHub API origin');
  const request = options.fetch ?? fetch,
    clock = options.clock ?? (() => new Date());
  async function call(route: GitHubRepositoryRoute, path: string, method = 'GET', body?: unknown, onSend?: () => void) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\'))
      throw new Error('Invalid GitHub path');
    const url = new URL(path, origin);
    if (url.origin !== origin.origin) throw new Error('Invalid GitHub origin');
    return options.credentials.use(route, async (token) => {
      let response: Response;
      try {
        onSend?.();
        response = await request(url, {
          method,
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2026-03-10',
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new GitHubFailure('unavailable');
      }
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))
      ) {
        const deadline = rateDeadline(response.headers, clock().getTime());
        throw new GitHubFailure('rate_limited', new Date(deadline).toISOString(), true);
      }
      if (response.status === 401 || response.status === 403) throw new GitHubFailure('permission', undefined, true);
      if (!response.ok)
        throw new GitHubFailure(
          'unavailable',
          undefined,
          method !== 'GET' && response.status >= 400 && response.status < 500,
        );
      let value: unknown;
      try {
        const text = await response.text();
        if (text.length > 8388608) throw new Error('size');
        value = JSON.parse(text);
      } catch {
        throw new GitHubFailure('invalid_response');
      }
      const link = response.headers.get('link');
      let next: string | null = null;
      if (link) {
        const match = /<([^>]+)>;\s*rel="next"/.exec(link);
        if (match) {
          const candidate = new URL(match[1]!);
          if (
            candidate.origin !== origin.origin ||
            candidate.pathname !== url.pathname ||
            candidate.username ||
            candidate.password
          )
            throw new GitHubFailure('invalid_response');
          next = candidate.pathname + candidate.search;
        }
      }
      return { value, next };
    });
  }
  async function* pages(route: GitHubRepositoryRoute, path: string) {
    const seen = new Set<string>();
    let next: string | null = path;
    while (next) {
      if (seen.has(next) || seen.size >= 1000) throw new GitHubFailure('invalid_response');
      seen.add(next);
      const page = await call(route, next);
      if (!Array.isArray(page.value)) throw new GitHubFailure('invalid_response');
      yield page.value as unknown[];
      next = page.next;
    }
  }
  return { call, pages };
}
export type GitHubHttp = ReturnType<typeof createGitHubHttp>;
export function repositoryPath(route: GitHubRepositoryRoute) {
  if (!/^[A-Za-z0-9_.-]+$/.test(route.owner) || !/^[A-Za-z0-9_.-]+$/.test(route.name))
    throw new Error('Invalid repository route');
  return `/repos/${encodeURIComponent(route.owner)}/${encodeURIComponent(route.name)}`;
}

/** GitHub advises at least one minute for secondary limits without retry headers. */
export function rateDeadline(headers: Headers, now: number): number {
  const after = Number(headers.get('retry-after')),
    reset = Number(headers.get('x-ratelimit-reset')) * 1000;
  const target = Math.max(
    Number.isFinite(after) && after > 0 ? now + after * 1000 : 0,
    Number.isFinite(reset) && reset > now ? reset : 0,
  );
  return target > now ? target : now + 60000;
}
