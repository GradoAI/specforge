import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutboxEvent, OutboxPort } from '@fasrun/backend-plugin-api';
import { createEventForwarder } from './forwarder.js';

const event: OutboxEvent = {
  version: 1,
  eventId: 'event-1',
  orgId: 'org-1',
  topic: 'governance.audit.appended',
  payload: { value: 1 },
  occurredAt: '2026-01-01T00:00:00.000Z',
};
function fixture() {
  let now = Date.parse(event.occurredAt);
  let leaseUntil = 0;
  let retryAt = 0;
  let token = 0;
  let acked = false;
  let failAck = false;
  const port = {
    ownerPlugin: 'governance',
    claim: vi.fn<OutboxPort['claim']>((request) => {
      if (acked || now < leaseUntil || now < retryAt) return Promise.resolve([]);
      leaseUntil = Date.parse(request.leaseUntil);
      return Promise.resolve([{ event: structuredClone(event), leaseToken: String(++token) }]);
    }),
    ack: vi.fn<OutboxPort['ack']>((request) => {
      if (request.leaseToken !== String(token) || now >= leaseUntil) return Promise.reject(new Error('Lease expired'));
      if (failAck) return Promise.reject(new Error('ACK unavailable'));
      acked = true;
      return Promise.resolve();
    }),
    retry: vi.fn<OutboxPort['retry']>((request) => {
      if (request.leaseToken !== String(token) || now >= leaseUntil) return Promise.reject(new Error('Lease expired'));
      leaseUntil = 0;
      retryAt = Date.parse(request.retryAt);
      return Promise.resolve();
    }),
  };
  return {
    port,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    failAck: (value: boolean) => {
      failAck = value;
    },
    isAcked: () => acked,
  };
}

afterEach(() => vi.useRealTimers());
describe('TC-SF5-GOVERNANCE-002 transaction event forwarding', () => {
  it('retries an ACK failure and leaves transactional eventId deduplication to consumers', async () => {
    const f = fixture();
    const forwarder = createEventForwarder({ workerId: 'worker', now: f.now, onError: vi.fn() });
    forwarder.register(f.port);
    const receipts = new Set<string>();
    let effects = 0;
    let deliveries = 0;
    forwarder.registerConsumer({
      id: 'audit',
      topic: event.topic,
      consume(value) {
        deliveries++;
        if (!receipts.has(value.eventId)) {
          effects++;
          receipts.add(value.eventId);
        }
        return Promise.resolve();
      },
    });
    f.failAck(true);
    await expect(forwarder.pollOnce()).rejects.toThrow('Outbox forwarding failed');
    expect(f.isAcked()).toBe(false);
    expect(f.port.retry).toHaveBeenCalledOnce();
    f.failAck(false);
    f.advance(1_000);
    await forwarder.pollOnce();
    expect({ deliveries, effects }).toEqual({ deliveries: 2, effects: 1 });
    expect(f.isAcked()).toBe(true);
  });

  it('reports stale leases and retries after lease expiry without discarding the event', async () => {
    const f = fixture();
    const forwarder = createEventForwarder({ workerId: 'worker', now: f.now, onError: vi.fn(), leaseMs: 100 });
    forwarder.register(f.port);
    let calls = 0;
    forwarder.registerConsumer({
      id: 'audit',
      topic: event.topic,
      consume() {
        if (++calls === 1) f.advance(101);
        return Promise.resolve();
      },
    });
    await expect(forwarder.pollOnce()).rejects.toMatchObject({ errors: [expect.any(Error), expect.any(Error)] });
    expect(f.isAcked()).toBe(false);
    await forwarder.pollOnce();
    expect(calls).toBe(2);
    expect(f.isAcked()).toBe(true);
  });

  it('polls when all notifications are lost and reports failures from unknown topics', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const errors = vi.fn();
    const forwarder = createEventForwarder({ workerId: 'worker', now: f.now, onError: errors, pollIntervalMs: 50 });
    forwarder.register(f.port);
    forwarder.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(errors).toHaveBeenCalledOnce();
    expect(forwarder.lastError).toBeInstanceOf(AggregateError);
    expect(f.port.ack).not.toHaveBeenCalled();
    f.advance(1_000);
    await vi.advanceTimersByTimeAsync(50);
    expect(errors).toHaveBeenCalledTimes(2);
    await forwarder.stop();
    const count = vi.mocked(f.port.claim).mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(f.port.claim).toHaveBeenCalledTimes(count);
  });

  it('drains a claimed delivery, isolates consumer payloads and prevents concurrent claims', async () => {
    const f = fixture();
    const forwarder = createEventForwarder({ workerId: 'worker', now: f.now, onError: vi.fn() });
    forwarder.register(f.port);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    forwarder.registerConsumer({
      id: 'first',
      topic: event.topic,
      async consume(value) {
        value.payload = 'mutated';
        await gate;
      },
    });
    const second = vi.fn(async () => {});
    forwarder.registerConsumer({ id: 'second', topic: event.topic, consume: second });
    const first = forwarder.pollOnce();
    expect(forwarder.pollOnce()).toBe(first);
    await Promise.resolve();
    const stopping = forwarder.stop();
    await expect(forwarder.pollOnce()).rejects.toThrow('stopping');
    expect(f.isAcked()).toBe(false);
    release();
    await stopping;
    expect(f.isAcked()).toBe(true);
    expect(second).toHaveBeenCalledWith(event);
    expect(f.port.claim).toHaveBeenCalledOnce();
  });

  it('retries all consumers after partial failure and only ACKs after every route succeeds', async () => {
    const f = fixture();
    const forwarder = createEventForwarder({ workerId: 'worker', now: f.now, onError: vi.fn() });
    forwarder.register(f.port);
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {}).mockRejectedValueOnce(new Error('consumer transaction rolled back'));
    forwarder.registerConsumer({ id: 'one', topic: event.topic, consume: first });
    forwarder.registerConsumer({ id: 'two', topic: event.topic, consume: second });
    await expect(forwarder.pollOnce()).rejects.toThrow();
    expect(f.port.ack).not.toHaveBeenCalled();
    f.advance(1_000);
    await forwarder.pollOnce();
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(f.isAcked()).toBe(true);
  });

  it('uses notifications only to wake a poll and retains polling after a throwing error observer', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const forwarder = createEventForwarder({
      workerId: 'worker',
      now: f.now,
      onError() {
        throw new Error('observer unavailable');
      },
      pollIntervalMs: 1_000,
    });
    forwarder.register(f.port);
    forwarder.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(forwarder.lastError).toBeInstanceOf(AggregateError);
    f.advance(1_000);
    forwarder.wake();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.port.claim).toHaveBeenCalledTimes(2);
    f.advance(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.port.claim).toHaveBeenCalledTimes(3);
    await forwarder.stop();
    forwarder.wake();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.port.claim).toHaveBeenCalledTimes(3);
  });

  it('rejects duplicate owners and consumer ids and continues other owners after a claim failure', async () => {
    const f = fixture();
    const forwarder = createEventForwarder({ workerId: 'worker', now: f.now, onError: vi.fn() });
    forwarder.register({
      ...f.port,
      ownerPlugin: 'failing',
      claim: () => Promise.reject(new Error('offline')),
    });
    forwarder.register(f.port);
    expect(() => forwarder.register(f.port)).toThrow('Duplicate');
    const consumer = { id: 'audit', topic: event.topic, consume: async () => {} };
    forwarder.registerConsumer(consumer);
    expect(() => forwarder.registerConsumer(consumer)).toThrow('Duplicate');
    await expect(forwarder.pollOnce()).rejects.toThrow();
    expect(f.isAcked()).toBe(true);
  });
});
