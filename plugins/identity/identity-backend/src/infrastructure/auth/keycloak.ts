import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import type { OidcProvider } from '../../common/ports.js';
export interface KeycloakOptions {
  issuer: string;
  audience: string;
  clientId: string;
  redirectUri: string;
  allowLoopbackHttp?: boolean;
  clock?: () => Date;
}
/** Only this trusted configuration determines endpoints: token headers cannot supply jku/x5u URLs. */
export function createKeycloakProvider(options: KeycloakOptions): OidcProvider {
  const issuer = new URL(options.issuer),
    redirect = new URL(options.redirectUri);
  const safe = (url: URL) =>
    url.protocol === 'https:' ||
    (options.allowLoopbackHttp === true &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  if (
    !safe(issuer) ||
    !safe(redirect) ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    !options.audience ||
    !options.clientId
  )
    throw new Error('Invalid trusted OIDC configuration');
  const endpoint = (name: string) => new URL(`${options.issuer.replace(/\/$/, '')}/protocol/openid-connect/${name}`);
  const jwks = createRemoteJWKSet(endpoint('certs'), {
    cooldownDuration: 0,
    timeoutDuration: 5000,
    cacheMaxAge: 300000,
  });
  const verify: OidcProvider['verify'] = async (token, kind = 'access') => {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, jwks, {
        issuer: options.issuer,
        audience: kind === 'id' ? options.clientId : options.audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'iss', 'aud'],
        currentDate: options.clock?.() ?? new Date(),
      });
      if (
        protectedHeader.jku ||
        protectedHeader.x5u ||
        !payload.sub ||
        !payload.exp ||
        (kind === 'access' && payload.typ !== 'Bearer')
      )
        throw new Error('Invalid token class');
      return {
        issuer: payload.iss!,
        subject: payload.sub,
        expiresAt: payload.exp,
        ...(typeof payload.nonce === 'string' ? { nonce: payload.nonce } : {}),
      };
    } catch {
      throw new Error('Identity authentication failed');
    }
  };
  return {
    verify,
    authorizationUrl(input) {
      const url = endpoint('auth');
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        response_type: 'code',
        scope: 'openid',
        state: input.state,
        nonce: input.nonce,
        code_challenge: input.challenge,
        code_challenge_method: 'S256',
      }).toString();
      return url.href;
    },
    async exchange(code, verifier) {
      try {
        const response = await fetch(endpoint('token'), {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: options.clientId,
            redirect_uri: options.redirectUri,
            code,
            code_verifier: verifier,
          }),
        });
        if (!response.ok) throw new Error('Token exchange rejected');
        const tokens = z.object({ id_token: z.string(), access_token: z.string() }).parse(await response.json());
        const identity = await verify(tokens.id_token, 'id');
        const access = await verify(tokens.access_token);
        if (access.subject !== identity.subject || access.issuer !== identity.issuer)
          throw new Error('Token subject mismatch');
        return { identity: { ...identity, expiresAt: Math.min(identity.expiresAt, access.expiresAt) } };
      } catch {
        throw new Error('Identity authentication failed');
      }
    },
  };
}
