import { createBackendModule } from '@fasrun/backend-plugin-api';
import { connectAdapters } from '@fasrun/plugin-connect-node';
import { createInbound } from '../application/inbound.js';
import { createOutbound } from '../application/outbound.js';
import { createGitHubHttp } from '../infrastructure/http.js';
import type { GitHubDependencies } from '../application/ports.js';
/** Explicit factory: no production fixture fallback, ambient secrets, database or automatic approval/merge. */
export function createGitHubModule(
  input: GitHubDependencies & {
    botUserId: string;
    http?: Omit<Parameters<typeof createGitHubHttp>[0], 'credentials' | 'clock'>;
  },
) {
  if (
    !input.outcome ||
    !input.reject ||
    !input.resolveExternal ||
    !input.authorize ||
    !input.references ||
    !input.actions ||
    !input.credentials
  )
    throw new Error('GitHub dependencies missing');
  const deps = { ...input, routes: structuredClone(input.routes) };
  const http = createGitHubHttp({
    ...input.http,
    credentials: deps.credentials,
    ...(deps.clock ? { clock: deps.clock } : {}),
  });
  const inbound = createInbound(deps, http),
    outbound = createOutbound(deps, http, input.botUserId);
  let auditHealthy = true;
  async function safe<T>(
    reason: 'webhook_rejected' | 'observation_failed' | 'outbound_failed',
    work: () => Promise<T>,
  ) {
    if (!auditHealthy) throw new Error(`GitHub ${reason}`);
    try {
      return await work();
    } catch {
      try {
        await deps.reject(reason);
      } catch {
        auditHealthy = false;
      }
      throw new Error(`GitHub ${reason}`);
    }
  }
  const adapter = {
    provider: 'github',
    performAction: (...args: Parameters<typeof outbound.performAction>) =>
      safe('outbound_failed', () => outbound.performAction(...args)),
    queryAction: (...args: Parameters<typeof outbound.queryAction>) =>
      safe('outbound_failed', () => outbound.queryAction(...args)),
  };
  return {
    module: createBackendModule({
      pluginId: 'connect',
      moduleId: 'github',
      register(env) {
        env.registerInit({
          deps: { adapters: connectAdapters },
          init({ adapters }) {
            adapters.register(adapter);
          },
        });
      },
    }),
    adapter,
    receive: (...args: Parameters<typeof inbound.receive>) => safe('webhook_rejected', () => inbound.receive(...args)),
    process: (...args: Parameters<typeof inbound.process>) =>
      safe('observation_failed', () => inbound.process(...args)),
    reconcile: (...args: Parameters<typeof inbound.reconcile>) =>
      safe('observation_failed', () => inbound.reconcile(...args)),
    start: () => {
      if (!auditHealthy) throw new Error('GitHub observation_failed');
      const runner = inbound.start(async () => {
        try {
          await deps.reject('observation_failed');
        } catch {
          auditHealthy = false;
          throw new Error('GitHub observation_failed');
        }
      });
      return { stop: () => safe('observation_failed', () => runner.stop()) };
    },
  };
}
