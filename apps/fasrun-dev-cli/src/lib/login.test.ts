import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CliErrorCodes } from '../errors.js';
import { runLogin, saveCredentials, type LoginDeps } from './login.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake authorization server: the token endpoint answers with the queued responses in order. */
function fakeDeps(tokenReplies: Response[], interval = 5) {
  let clock = 0;
  const sleeps: number[] = [];
  const deps: LoginDeps = {
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    prompt: () => undefined,
    fetch: ((url: string) => {
      if (url.endsWith('/.well-known/oauth-authorization-server')) {
        return Promise.resolve(
          json(200, { device_authorization_endpoint: 'https://auth/device', token_endpoint: 'https://auth/token' }),
        );
      }
      if (url === 'https://auth/device') {
        return Promise.resolve(
          json(200, {
            device_code: 'd',
            user_code: 'U',
            verification_uri: 'https://auth/activate',
            expires_in: 60,
            interval,
          }),
        );
      }
      return Promise.resolve(tokenReplies.shift() ?? json(400, { error: 'authorization_pending' }));
    }) as typeof fetch,
  };
  return { deps, sleeps };
}

describe('runLogin', () => {
  it('waits 5 more seconds after slow_down, as RFC 8628 requires', async () => {
    const config = mkdtempSync(join(tmpdir(), 'fasrun-login-'));
    dirs.push(config);
    const { deps, sleeps } = fakeDeps([
      json(400, { error: 'authorization_pending' }),
      json(400, { error: 'slow_down' }),
      json(200, { access_token: 't', expires_in: 60 }),
    ]);
    await runLogin({ FASRUN_ENDPOINT: 'https://fasrun.example', FASRUN_CONFIG: config }, deps);
    expect(sleeps).toEqual([5000, 5000, 10000]);
  });

  it('reports an expired code when the deadline passes while pending', async () => {
    const { deps } = fakeDeps([], 30);
    await expect(runLogin({ FASRUN_ENDPOINT: 'https://fasrun.example' }, deps)).rejects.toMatchObject({
      code: CliErrorCodes.AUTH_EXPIRED,
    });
  });

  it('reports an unreachable endpoint with exit code 4', async () => {
    const deps = { ...fakeDeps([]).deps, fetch: (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch };
    const error = await runLogin({ FASRUN_ENDPOINT: 'http://127.0.0.1:1' }, deps).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: CliErrorCodes.UNREACHABLE, exitCode: 4 });
  });

  it('writes the credentials file with mode 0600 inside a 0700 directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fasrun-creds-'));
    dirs.push(root);
    const file = await saveCredentials(join(root, 'config'), { access_token: 't' });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(root, 'config')).mode & 0o777).toBe(0o700);
  });
});
