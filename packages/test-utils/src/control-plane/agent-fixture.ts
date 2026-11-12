export interface FixtureAgentCall {
  callId: string;
  attempt: number;
}
export type FixtureAgentOutcome = 'success' | 'failed' | 'invalid' | 'timeout' | 'cancelled';
export interface FixtureAgentResponse<TCall> {
  call: TCall;
  implementationId: string;
  outcome: FixtureAgentOutcome;
}

/** Two replaceable fixtures return caller-supplied payloads through the same minimal test interface.
 * The production AgentCall/AgentResult validator still runs in the consumer; raw output is deliberately unknown.
 */
export function createAgentFixture<TCall extends FixtureAgentCall>(options: {
  implementation: 'a' | 'b';
  enabled: true;
  response: (request: FixtureAgentResponse<TCall>) => unknown;
  outcomes?: readonly FixtureAgentOutcome[];
}) {
  if (options.enabled !== true) throw new Error('Agent fixture must be explicitly enabled');
  const implementationId = `controlled-agent-${options.implementation}@1`;
  const outcomes = [...(options.outcomes ?? [])];
  const calls: TCall[] = [];
  const results = new Map<string, unknown>();
  const cancellations = new Set<string>();
  const key = (call: FixtureAgentCall) => {
    if (!call.callId || !Number.isSafeInteger(call.attempt) || call.attempt < 1)
      throw new Error('Invalid fixture call identity');
    return JSON.stringify([call.callId, call.attempt]);
  };
  return {
    implementationId,
    /** invoke is retryable for the same call/attempt; new attempts are separate recorded invocations. */
    invoke(call: TCall): Promise<unknown> {
      const id = key(call);
      if (results.has(id)) return Promise.resolve(structuredClone(results.get(id)));
      const copy = structuredClone(call);
      calls.push(copy);
      const outcome = cancellations.has(id) ? 'cancelled' : (outcomes.shift() ?? 'success');
      if (outcome === 'timeout') return Promise.reject(new Error('Fixture agent deadline exceeded'));
      const output = options.response({ call: copy, implementationId, outcome });
      results.set(id, structuredClone(output));
      return Promise.resolve(structuredClone(output));
    },
    getResult(call: FixtureAgentCall): Promise<unknown> {
      return Promise.resolve(structuredClone(results.get(key(call))));
    },
    cancel(call: TCall): Promise<void> {
      const id = key(call);
      cancellations.add(id);
      if (!results.has(id)) {
        const output = options.response({ call: structuredClone(call), implementationId, outcome: 'cancelled' });
        results.set(id, structuredClone(output));
      }
      return Promise.resolve();
    },
    calls: () => structuredClone(calls),
  };
}
