import { describe, expect, it } from 'vitest';
import { createAgentFixture } from './agent-fixture.js';
import { createFaultInjector, createFixtureClock } from './determinism.js';
import { createGitHubFixture, FixtureHttpError } from './github-fixture.js';

describe('TC-SF5-FIXTURE-001 isolated control plane fixtures', () => {
  it('repeats clocks and identifiers without sharing state, and rejects invalid time/ID input', () => {
    const a = createFixtureClock();
    const b = createFixtureClock();
    expect(a.nextId('work')).toBe(b.nextId('work'));
    a.advance(15 * 60_000);
    expect(a.now()).toBe('2026-01-01T00:15:00.000Z');
    expect(b.now()).toBe('2026-01-01T00:00:00.000Z');
    expect(a.nextId('work')).toBe('work_000002');
    expect(a.nextId('event')).toBe('event_000001');
    expect(() => a.advance(-1)).toThrow();
    expect(() => a.advance(Infinity)).toThrow();
    expect(() => a.nextId('../work')).toThrow();
    expect(() => createFixtureClock('invalid')).toThrow();
    expect(() => createFixtureClock('2026-01-01T00:00:00')).toThrow();
    expect(createFixtureClock('2026-01-01T08:00:00+08:00').now()).toBe(b.now());
  });

  it('consumes explicit faults once and does not expose mutable history', () => {
    const faults = createFaultInjector();
    faults.arm('commit');
    faults.arm('commit', new Error('second failure'));
    expect(() => faults.hit('commit')).toThrow('Injected fault');
    expect(() => faults.hit('commit')).toThrow('second failure');
    expect(() => faults.hit('commit')).not.toThrow();
    faults.history().pop();
    expect(faults.history()).toHaveLength(3);
    expect(() => createFaultInjector().hit('commit')).not.toThrow();
  });

  it('delivers duplicate/reordered snapshots while current external state remains newest', () => {
    const github = createGitHubFixture();
    github.publish({ deliveryId: 'new', objectId: 'issue-1', revision: 2, payload: { state: 'closed' } });
    github.publish({ deliveryId: 'old', objectId: 'issue-1', revision: 1, payload: { state: 'open' } });
    expect(github.deliveries([0, 1, 0]).map((d) => d.deliveryId)).toEqual(['new', 'old', 'new']);
    expect(github.readObject('issue-1')?.payload).toEqual({ state: 'closed' });
    const copy = github.deliveries();
    copy[0]!.payload = 'modified';
    expect(github.readObject('issue-1')?.payload).toEqual({ state: 'closed' });
    expect(createGitHubFixture().readObject('issue-1')).toBeUndefined();
    expect(() => github.deliveries([9])).toThrow();
    expect(() => github.publish({ deliveryId: '', objectId: 'x', revision: 0, payload: null })).toThrow();
  });

  it('models 429, effect-before-response-loss, and query-before-retry without assuming GitHub idempotency', () => {
    for (const supportsIdempotencyKey of [false, true]) {
      const github = createGitHubFixture({ supportsIdempotencyKey });
      const rateLimited = new FixtureHttpError(429, 7);
      github.faults.arm('github.before-effect', rateLimited);
      expect(() => github.createEffect('action-1', 'body', 'key-1')).toThrow(rateLimited);
      expect(rateLimited.retryAfterSeconds).toBe(7);
      expect(github.effects()).toHaveLength(0);
      github.faults.arm('github.after-effect', new Error('response lost'));
      expect(() => github.createEffect('action-1', 'body', 'key-1')).toThrow('response lost');
      expect(github.findByMarker('action-1')).toHaveLength(1);
      github.createEffect('action-1', 'body', 'key-1');
      // Without remote idempotency, blindly retrying duplicates the effect; the fixture does not hide it.
      expect(github.effects()).toHaveLength(supportsIdempotencyKey ? 1 : 2);
      github.effects().pop();
      expect(github.findByMarker('action-1')).toHaveLength(supportsIdempotencyKey ? 1 : 2);
    }
  });

  it('switches versioned agents through one interface and returns invalid data unfiltered for consumer validation', async () => {
    const response = ({ outcome, implementationId }: { outcome: string; implementationId: string }) =>
      outcome === 'invalid'
        ? { approved: true, steps: ['untrusted'], malformed: null }
        : { status: outcome, implementationId };
    const a = createAgentFixture({ enabled: true, implementation: 'a', response, outcomes: ['failed', 'invalid'] });
    const b = createAgentFixture({ enabled: true, implementation: 'b', response });
    const call = { callId: 'call-1', attempt: 1 };
    expect(await a.invoke(call)).toEqual({ status: 'failed', implementationId: 'controlled-agent-a@1' });
    expect(await a.invoke(call)).toEqual(await a.getResult(call));
    expect(a.calls()).toHaveLength(1);
    expect(await a.invoke({ ...call, attempt: 2 })).toEqual({ approved: true, steps: ['untrusted'], malformed: null });
    expect(await b.invoke(call)).toEqual({ status: 'success', implementationId: 'controlled-agent-b@1' });
    expect(b.calls()).toHaveLength(1);
    a.calls().pop();
    expect(a.calls()).toHaveLength(2);
  });

  it('records timeout and cancellation distinctly; late cancellation cannot overwrite a completed result', async () => {
    const fixture = createAgentFixture({
      enabled: true,
      implementation: 'a',
      outcomes: ['timeout'],
      response: ({ outcome }) => ({ status: outcome }),
    });
    const call = { callId: 'call', attempt: 1 };
    await expect(fixture.invoke(call)).rejects.toThrow('deadline exceeded');
    expect(await fixture.getResult(call)).toBeUndefined();
    await fixture.cancel(call);
    expect(await fixture.invoke(call)).toEqual({ status: 'cancelled' });
    const next = { ...call, attempt: 2 };
    expect(await fixture.invoke(next)).toEqual({ status: 'success' });
    await fixture.cancel(next);
    expect(await fixture.getResult(next)).toEqual({ status: 'success' });
    expect(() => fixture.invoke({ callId: '', attempt: 0 })).toThrow('identity');
    expect(() => createAgentFixture({ enabled: false as true, implementation: 'a', response: () => null })).toThrow(
      'explicitly enabled',
    );
  });
});
