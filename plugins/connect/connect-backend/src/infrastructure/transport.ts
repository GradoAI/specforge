import type { InternalTarget } from './authority.js';
import { createServer, request, type ServerOptions } from 'node:https';
import { checkServerIdentity, type TLSSocket } from 'node:tls';
import { operationContextSchema, type OperationContext } from '@fasrun/contracts-core';
import type { ConnectState } from '../application/state.js';
import type { CoreStateClient } from '../application/gateway.js';
import { credentialEnvelopeSchema, inboxEventSchema, inboxReceiptSchema } from '@fasrun/plugin-connect-common';
export interface InternalTls {
  ca: string | Buffer;
  cert: string | Buffer;
  key: string | Buffer;
  peerName: string;
}
function tls(options: InternalTls): ServerOptions {
  if (!options.ca || !options.cert || !options.key || !options.peerName)
    throw new Error('Internal TLS configuration required');
  return {
    ca: options.ca,
    cert: options.cert,
    key: options.key,
    minVersion: 'TLSv1.3',
    requestCert: true,
    rejectUnauthorized: true,
  };
}
/** Authentication derives from the TLS socket, never body/header flags. The resolver binds the transmitted
 * actor to current persisted authorization and the authenticated service; it must not trust a self-asserted actor. */
export function createConnectInternalServer(options: {
  tls: InternalTls;
  state: ConnectState;
  /** Trusted host security audit sink. Resolve tenant/service from configuration, NEVER the rejected body.
   * Unknown peers use deployment security audit, not an invented organization. Failure disables this server. */
  recordRejection(event: {
    peer?: string;
    reason: 'tls_rejected' | 'request_rejected' | 'identity_rejected' | 'operation_rejected';
  }): Promise<void>;
  resolveContext(peer: string, requested: OperationContext, target: InternalTarget): Promise<OperationContext>;
}) {
  if (!options.recordRejection) throw new Error('Security audit sink required');
  let auditHealthy = true;
  async function reject(event: Parameters<typeof options.recordRejection>[0]) {
    try {
      await options.recordRejection(event);
    } catch {
      auditHealthy = false;
    }
  }
  const server = createServer(tls(options.tls), (req, res) => {
    void (async () => {
      let peer: string | undefined;
      let reason: 'request_rejected' | 'identity_rejected' | 'operation_rejected' = 'request_rejected';
      try {
        if (!auditHealthy) throw new Error('Security audit unavailable');
        const socket = req.socket as TLSSocket;
        if (!socket.authorized || checkServerIdentity(options.tls.peerName, socket.getPeerCertificate()))
          throw new Error('Invalid service certificate');
        peer = options.tls.peerName;
        if (
          req.method !== 'POST' ||
          !['/inbox/accept', '/credentials/store', '/credentials/read'].includes(req.url ?? '')
        )
          throw new Error('Unknown operation');
        let length = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk as Uint8Array);
          length += bytes.length;
          if (length > 262144) throw new Error('Too large');
          chunks.push(bytes);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          context: unknown;
          repositoryId: string;
          event: unknown;
          envelope: unknown;
          expectedVersion: string | null;
          integrationId: string;
        };
        const requested = operationContextSchema.parse(body.context);
        reason = 'identity_rejected';
        const context = operationContextSchema.parse(
          await options.resolveContext(
            options.tls.peerName,
            requested,
            req.url === '/inbox/accept'
              ? {
                  operation: 'accept',
                  id: body.repositoryId,
                  installationId: inboxEventSchema.parse(body.event).installationId,
                }
              : {
                  operation: req.url === '/credentials/store' ? 'storeCredential' : 'credential',
                  id:
                    req.url === '/credentials/store'
                      ? credentialEnvelopeSchema.parse(body.envelope).integrationId
                      : body.integrationId,
                },
          ),
        );
        if (context.actor.orgId !== requested.actor.orgId) throw new Error('Wrong tenant');
        reason = 'operation_rejected';
        let value: unknown;
        switch (req.url) {
          case '/inbox/accept':
            if (typeof body.repositoryId !== 'string' || !body.repositoryId) throw new Error('Repository required');
            value = await options.state.accept(context, body.repositoryId, inboxEventSchema.parse(body.event));
            break;
          case '/credentials/store':
            if (body.expectedVersion !== null && typeof body.expectedVersion !== 'string')
              throw new Error('Version required');
            await options.state.storeCredential(
              context,
              credentialEnvelopeSchema.parse(body.envelope),
              body.expectedVersion,
            );
            value = { persisted: true };
            break;
          case '/credentials/read':
            if (typeof body.integrationId !== 'string' || !body.integrationId) throw new Error('Integration required');
            value = await options.state.credential(context, body.integrationId);
            break;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value));
      } catch {
        await reject({ ...(peer ? { peer } : {}), reason });
        res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ code: 'connect.rejected' }));
      }
    })();
  });
  server.on('tlsClientError', () => {
    void reject({ reason: 'tls_rejected' });
  });
  return server;
}
export function createConnectInternalClient(options: { tls: InternalTls; origin: string }): CoreStateClient {
  const base = new URL(options.origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/')
    throw new Error('HTTPS origin required');
  const config = tls(options.tls);
  async function call(path: string, body: unknown): Promise<unknown> {
    try {
      return await new Promise((resolve, reject) => {
        const req = request(
          new URL(path, base),
          {
            ...config,
            method: 'POST',
            servername: options.tls.peerName,
            checkServerIdentity: (_name, certificate) => checkServerIdentity(options.tls.peerName, certificate),
            headers: { 'content-type': 'application/json' },
            timeout: 10000,
          },
          (res) => {
            let size = 0;
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > 262144) {
                res.destroy();
                reject(new Error('Too large'));
              } else chunks.push(chunk);
            });
            res.on('error', reject);
            res.on('end', () => {
              try {
                if (res.statusCode !== 200) throw new Error('Rejected');
                resolve(JSON.parse(Buffer.concat(chunks).toString()));
              } catch {
                reject(new Error('Invalid response'));
              }
            });
          },
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Timeout')));
        req.end(JSON.stringify(body));
      });
    } catch {
      throw new Error('Connect internal transport unavailable');
    }
  }
  return {
    accept: async (context, repositoryId, event) =>
      inboxReceiptSchema.parse(await call('/inbox/accept', { context, repositoryId, event })),
    storeCredential: async (context, envelope, expectedVersion) => {
      const result = await call('/credentials/store', { context, envelope, expectedVersion });
      if (!result || typeof result !== 'object' || !('persisted' in result) || result.persisted !== true)
        throw new Error('Missing persistent receipt');
    },
    credential: async (context, integrationId) =>
      credentialEnvelopeSchema.parse(await call('/credentials/read', { context, integrationId })),
  };
}
