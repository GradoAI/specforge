import { request } from 'node:https';
import { createManagedContextResolver } from './authority.js';
import { createCredentialCipher } from './encryption.js';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createConnectInternalServer, createConnectInternalClient, type InternalTls } from './transport.js';
import type { OperationContext } from '@fasrun/contracts-core';
import type { ConnectState } from '../application/state.js';
let directory: string;
let coreTls: InternalTls, gatewayTls: InternalTls, wrongTls: InternalTls;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fasrun-connect-tls-'));
  function openssl(args: string[]) {
    execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' });
  }
  openssl([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'ca.key',
    '-out',
    'ca.crt',
    '-days',
    '1',
    '-subj',
    '/CN=Fasrun fixture CA',
  ]);
  for (const name of ['core.test', 'gateway.test', 'wrong.test']) {
    openssl([
      'req',
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      name + '.key',
      '-out',
      name + '.csr',
      '-subj',
      '/CN=' + name,
    ]);
    await writeFile(
      join(directory, name + '.ext'),
      `subjectAltName=DNS:${name}\nextendedKeyUsage=serverAuth,clientAuth\n`,
    );
    openssl([
      'x509',
      '-req',
      '-in',
      name + '.csr',
      '-CA',
      'ca.crt',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      name + '.crt',
      '-days',
      '1',
      '-extfile',
      name + '.ext',
    ]);
  }
  const config = async (name: string, peerName: string): Promise<InternalTls> => ({
    ca: await readFile(join(directory, 'ca.crt')),
    cert: await readFile(join(directory, name + '.crt')),
    key: await readFile(join(directory, name + '.key')),
    peerName,
  });
  coreTls = await config('core.test', 'gateway.test');
  gatewayTls = await config('gateway.test', 'core.test');
  wrongTls = await config('wrong.test', 'core.test');
}, 30000);
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
it('TC-SF5-CONNECT-002 actual mutual TLS rejects wrong service identity and current actor resolution', async () => {
  const context: OperationContext = {
    actor: {
      version: 1,
      actorId: 'member',
      actorKind: 'member',
      orgId: 'org',
      clientId: 'fixture',
      source: 'internal',
      traceId: 'trace',
    },
    scope: { orgId: 'org' },
    permission: 'connect.credential.use',
    object: { type: 'integration', id: 'integration' },
  };
  let resolveAllowed = true,
    calls = 0;
  let present = false;
  const envelope = createCredentialCipher({ activeVersion: () => '1', key: () => Buffer.alloc(32, 3) }).encrypt(
    'org',
    'integration',
    '1',
    Buffer.from('fixture'),
  );
  const state = {
    credential: () => {
      calls++;
      return present ? Promise.resolve(envelope) : Promise.reject(new Error('No credential'));
    },
  } as unknown as ConnectState;
  const rejected: string[] = [];
  let auditWorks = true;
  const server = createConnectInternalServer({
    recordRejection: (e) => {
      rejected.push(e.reason);
      return auditWorks ? Promise.resolve() : Promise.reject(new Error('Audit unavailable'));
    },
    tls: coreTls,
    state,
    resolveContext: createManagedContextResolver({
      binding: (peer, target) =>
        peer === 'gateway.test' && target.id === 'integration'
          ? Promise.resolve(context)
          : Promise.reject(new Error('Missing binding')),
      identity: {
        authorize: () =>
          Promise.resolve({ allowed: resolveAllowed, matchedRuleIds: [], policyVersion: 'fixture', reason: 'fixture' }),
      },
      audit: { audit: (e) => Promise.resolve({ eventId: e.eventId, sequence: 1, hash: 'a'.repeat(64) }) },
    }),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const origin = `https://127.0.0.1:${address.port}/`;
  function raw(path: string, body: unknown): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = request(
        new URL(path, origin),
        { method: 'POST', ca: gatewayTls.ca, cert: gatewayTls.cert, key: gatewayTls.key, servername: 'core.test' },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
  }

  try {
    await expect(
      createConnectInternalClient({ tls: wrongTls, origin }).credential(context, 'integration'),
    ).rejects.toThrow('unavailable');
    expect(calls).toBe(0);
    resolveAllowed = false;
    await expect(
      createConnectInternalClient({ tls: gatewayTls, origin }).credential(context, 'integration'),
    ).rejects.toThrow('unavailable');
    expect(calls).toBe(0);
    resolveAllowed = true;
    await expect(
      createConnectInternalClient({ tls: gatewayTls, origin }).credential(context, 'integration'),
    ).rejects.toThrow('unavailable');
    expect(calls).toBe(1);
    await expect(
      createConnectInternalClient({ tls: { ...gatewayTls, peerName: 'wrong.test' }, origin }).credential(
        context,
        'integration',
      ),
    ).rejects.toThrow('unavailable');
    expect(calls).toBe(1);
    expect(rejected).toContain('identity_rejected');
    expect(rejected).toContain('request_rejected');
    present = true;
    expect(await createConnectInternalClient({ tls: gatewayTls, origin }).credential(context, 'integration')).toEqual(
      envelope,
    );
    expect(await raw('/unknown', { context })).toBe(403);
    expect(await raw('/credentials/read', { context: { actorId: 'untrusted-secret' } })).toBe(403);
    auditWorks = false;
    expect(await raw('/unknown', { context })).toBe(403);
    const prior = calls;
    await expect(
      createConnectInternalClient({ tls: gatewayTls, origin }).credential(context, 'integration'),
    ).rejects.toThrow('unavailable');
    expect(calls).toBe(prior);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
