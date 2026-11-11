// fasrun login (R-platform-015.S5; SF-1 D-10; tech plan 2.6): OAuth 2.0 device authorization (RFC 8628) against
// the authorization server advertised at <FASRUN_ENDPOINT>/.well-known/oauth-authorization-server (RFC 8414).
// The token is stored with mode 0600 and never printed.
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError, CliErrorCodes } from '../errors.js';

export const CLIENT_ID = 'fasrun-cli';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

export interface LoginDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Called once with what the person must open and type; written to stderr by the command. */
  prompt: (verification: { uri: string; userCode: string }) => void;
}

export interface LoginResult {
  endpoint: string;
  credentialsFile: string;
  expiresAt: string | null;
}

interface DeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export function configDirectory(env: Readonly<Record<string, string | undefined>>): string {
  return env.FASRUN_CONFIG ?? join(homedir(), '.config', 'fasrun');
}

async function request<T>(deps: LoginDeps, url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  let response: Response;
  try {
    response = await deps.fetch(url, init);
  } catch (error) {
    throw new CliError(CliErrorCodes.UNREACHABLE, `Cannot reach ${url}: ${(error as Error).message}`);
  }
  let body: T;
  try {
    body = (await response.json()) as T;
  } catch {
    throw new CliError(CliErrorCodes.UNREACHABLE, `${url} did not return JSON (HTTP ${response.status})`);
  }
  return { status: response.status, body };
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams(fields).toString(),
});

/** Writes the credentials atomically: a temporary file with mode 0600 in the same directory, then a rename. */
export async function saveCredentials(directory: string, credentials: Record<string, unknown>): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = join(directory, 'credentials.json');
  const temporary = join(directory, `.credentials.${randomBytes(6).toString('hex')}.tmp`);
  await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, target);
  return target;
}

export async function runLogin(
  env: Readonly<Record<string, string | undefined>>,
  deps: LoginDeps,
): Promise<LoginResult> {
  const endpoint = env.FASRUN_ENDPOINT?.replace(/\/+$/, '');
  if (!endpoint) {
    throw new CliError(
      CliErrorCodes.CONFIG_INVALID,
      'FASRUN_ENDPOINT is not set; set it to the Fasrun address, e.g. https://app.fasrun.dev',
    );
  }
  const metadata = await request<{ device_authorization_endpoint?: string; token_endpoint?: string }>(
    deps,
    `${endpoint}/.well-known/oauth-authorization-server`,
    { headers: { accept: 'application/json' } },
  );
  const { device_authorization_endpoint: deviceUrl, token_endpoint: tokenUrl } = metadata.body;
  if (metadata.status !== 200 || !deviceUrl || !tokenUrl) {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, `${endpoint} does not advertise device authorization`);
  }

  const device = await request<DeviceAuthorization>(deps, deviceUrl, form({ client_id: CLIENT_ID, scope: 'openid' }));
  if (device.status !== 200 || !device.body.device_code) {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, `Device authorization was refused (HTTP ${device.status})`);
  }
  deps.prompt({
    uri: device.body.verification_uri_complete ?? device.body.verification_uri,
    userCode: device.body.user_code,
  });

  let interval = (device.body.interval ?? 5) * 1000;
  const deadline = deps.now() + device.body.expires_in * 1000;
  for (;;) {
    if (deps.now() >= deadline)
      throw new CliError(CliErrorCodes.AUTH_EXPIRED, 'The device code expired before it was approved');
    await deps.sleep(interval);
    const token = await request<TokenResponse>(
      deps,
      tokenUrl,
      form({ grant_type: DEVICE_GRANT, device_code: device.body.device_code, client_id: CLIENT_ID }),
    );
    if (token.status === 200 && token.body.access_token) {
      const expiresAt =
        token.body.expires_in === undefined ? null : new Date(deps.now() + token.body.expires_in * 1000).toISOString();
      const credentialsFile = await saveCredentials(configDirectory(env), {
        endpoint,
        token_type: token.body.token_type ?? 'Bearer',
        access_token: token.body.access_token,
        refresh_token: token.body.refresh_token,
        expires_at: expiresAt,
      });
      return { endpoint, credentialsFile, expiresAt };
    }
    switch (token.body.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        interval += 5000;
        continue;
      case 'access_denied':
        throw new CliError(CliErrorCodes.AUTH_DENIED, 'The login request was denied');
      case 'expired_token':
        throw new CliError(CliErrorCodes.AUTH_EXPIRED, 'The device code expired before it was approved');
      default:
        throw new CliError(
          CliErrorCodes.CONFIG_INVALID,
          `The token endpoint returned ${token.body.error ?? `HTTP ${token.status}`}${token.body.error_description ? `: ${token.body.error_description}` : ''}`,
        );
    }
  }
}
