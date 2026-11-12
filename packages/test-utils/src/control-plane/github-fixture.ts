import { createFaultInjector, createFixtureClock } from './determinism.js';

export class FixtureHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Fixture HTTP ${status}`);
    this.name = 'FixtureHttpError';
  }
}

export interface FixtureDelivery {
  deliveryId: string;
  objectId: string;
  revision: number;
  payload: unknown;
}
export interface FixtureExternalEffect {
  id: string;
  marker: string;
  payload: unknown;
}

/** Isolated external-system double, not a GitHub protocol client or an inbox implementation. */
export function createGitHubFixture(options: { supportsIdempotencyKey?: boolean } = {}) {
  const clock = createFixtureClock();
  const faults = createFaultInjector();
  const deliveries: FixtureDelivery[] = [];
  const objects = new Map<string, FixtureDelivery>();
  const effects: FixtureExternalEffect[] = [];
  const keys = new Map<string, FixtureExternalEffect>();
  return {
    version: 'github-fixture@1',
    faults,
    publish(delivery: FixtureDelivery) {
      if (
        !delivery.deliveryId ||
        !delivery.objectId ||
        !Number.isSafeInteger(delivery.revision) ||
        delivery.revision < 1
      )
        throw new Error('Invalid fixture delivery');
      const copy = structuredClone(delivery);
      deliveries.push(copy);
      if ((objects.get(copy.objectId)?.revision ?? 0) < copy.revision) objects.set(copy.objectId, copy);
    },
    /** Indices may repeat or reverse to exercise delivery duplication and reordering. */
    deliveries(indices: readonly number[] = deliveries.map((_, i) => i)): FixtureDelivery[] {
      return indices.map((index) => {
        const delivery = deliveries[index];
        if (!Number.isInteger(index) || !delivery) throw new Error('Unknown fixture delivery index');
        return structuredClone(delivery);
      });
    },
    readObject(objectId: string): FixtureDelivery | undefined {
      faults.hit('github.read');
      return structuredClone(objects.get(objectId));
    },
    createEffect(marker: string, payload: unknown, idempotencyKey?: string): FixtureExternalEffect {
      if (!marker) throw new Error('Fixture marker is required');
      faults.hit('github.before-effect');
      if (options.supportsIdempotencyKey && idempotencyKey) {
        const existing = keys.get(idempotencyKey);
        if (existing) return structuredClone(existing);
      }
      const effect = { id: clock.nextId('external'), marker, payload: structuredClone(payload) };
      effects.push(effect);
      if (options.supportsIdempotencyKey && idempotencyKey) keys.set(idempotencyKey, effect);
      // This failure preserves the external effect; callers must query before resending.
      faults.hit('github.after-effect');
      return structuredClone(effect);
    },
    findByMarker(marker: string): FixtureExternalEffect[] {
      faults.hit('github.query-effect');
      return structuredClone(effects.filter((effect) => effect.marker === marker));
    },
    effects: () => structuredClone(effects),
  };
}
