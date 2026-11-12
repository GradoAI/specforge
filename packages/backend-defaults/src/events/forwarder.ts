import type { OutboxEvent, OutboxPort, OutboxRegistry } from '@fasrun/backend-plugin-api';

export interface EventConsumer {
  /** Stable identity; the consumer persists its own eventId receipt with its business effect. */
  readonly id: string;
  readonly topic: string;
  consume(event: OutboxEvent): Promise<void>;
}
export interface EventForwarderOptions {
  workerId: string;
  pollIntervalMs?: number;
  leaseMs?: number;
  retryDelayMs?: number;
  batchSize?: number;
  now?: () => number;
  /** Reports background delivery/claim failures. Manual pollOnce also rejects with those failures. */
  onError: (error: unknown) => void;
}
export interface EventForwarder extends OutboxRegistry {
  registerConsumer(consumer: EventConsumer): void;
  pollOnce(): Promise<void>;
  start(): void;
  /** A NOTIFY adapter can call this; the notification contains no authoritative delivery state. */
  wake(): void;
  /** Stop claiming new batches and await the current batch, including ACK/retry attempts. */
  stop(): Promise<void>;
  readonly lastError: unknown;
}

/** At-least-once delivery through owner-bound ports, with no cross-plugin database access. */
export function createEventForwarder(options: EventForwarderOptions): EventForwarder {
  const { workerId, onError } = options;
  if (!workerId.trim()) throw new Error('workerId must not be empty');
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const leaseMs = options.leaseMs ?? 30_000;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const batchSize = options.batchSize ?? 100;
  for (const [name, value] of Object.entries({ pollIntervalMs, leaseMs, retryDelayMs, batchSize })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`);
  }
  const now = options.now ?? Date.now;
  const ports = new Map<string, OutboxPort>();
  const consumers = new Map<string, EventConsumer>();
  let active = false;
  let stopping = false;
  let requested = false;
  let inFlight: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastError: unknown;
  const timestamp = (delay: number) => new Date(now() + delay).toISOString();

  async function deliver(): Promise<void> {
    const errors: unknown[] = [];
    for (const port of ports.values()) {
      if (stopping) break;
      try {
        const events = await port.claim({ workerId, limit: batchSize, leaseUntil: timestamp(leaseMs) });
        for (const claimed of events) {
          const { event, leaseToken } = claimed;
          try {
            const routes = [...consumers.values()].filter((consumer) => consumer.topic === event.topic);
            if (routes.length === 0) throw new Error(`No consumer registered for topic ${event.topic}`);
            // Each consumer sees an independent DTO; mutation cannot change another consumer's input or ACK identity.
            for (const consumer of routes) await consumer.consume(structuredClone(event));
            await port.ack({ eventId: event.eventId, leaseToken });
          } catch (error) {
            errors.push(error);
            try {
              await port.retry({ eventId: event.eventId, leaseToken, retryAt: timestamp(retryDelayMs) });
            } catch (retryError) {
              // A stale lease must never be ACKed by this worker. Its owner's lease expiry enables redelivery.
              errors.push(retryError);
            }
          }
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Outbox forwarding failed');
  }
  function pollOnce(): Promise<void> {
    if (stopping) return Promise.reject(new Error('Event forwarder is stopping'));
    if (inFlight) return inFlight;
    inFlight = deliver().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }
  function schedule(delay: number): void {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void background();
    }, delay);
  }
  async function background(): Promise<void> {
    requested = false;
    try {
      await pollOnce();
    } catch (error) {
      lastError = error;
      try {
        onError(error);
      } catch (reportError) {
        lastError = new AggregateError([error, reportError], 'Outbox forwarding and error reporting failed');
      }
    } finally {
      schedule(requested ? 0 : pollIntervalMs);
    }
  }
  return {
    register(port) {
      if (active || inFlight || stopping) throw new Error('Register ports before forwarding starts');
      if (!port.ownerPlugin.trim() || ports.has(port.ownerPlugin)) throw new Error('Duplicate or empty outbox owner');
      ports.set(port.ownerPlugin, port);
    },
    registerConsumer(consumer) {
      if (active || inFlight || stopping) throw new Error('Register consumers before forwarding starts');
      if (!consumer.id.trim() || !consumer.topic.trim() || consumers.has(consumer.id)) {
        throw new Error('Duplicate or empty event consumer');
      }
      consumers.set(consumer.id, consumer);
    },
    pollOnce,
    start() {
      if (stopping) throw new Error('Event forwarder is stopping');
      if (active) return;
      active = true;
      schedule(0);
    },
    wake() {
      if (!active) return;
      if (inFlight) requested = true;
      else schedule(0);
    },
    async stop() {
      active = false;
      stopping = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      try {
        await inFlight;
      } finally {
        stopping = false;
      }
    },
    get lastError() {
      return lastError;
    },
  };
}
