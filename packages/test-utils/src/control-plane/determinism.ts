/** Deterministic test inputs; never use this clock or identifier source as a production allocator. */
export function createFixtureClock(initial = '2026-01-01T00:00:00.000Z') {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(initial))
    throw new Error('Fixture time must be an ISO instant with an explicit timezone');
  let milliseconds = Date.parse(initial);
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid fixture time');
  const counters = new Map<string, number>();
  return {
    now: () => new Date(milliseconds).toISOString(),
    advance(ms: number) {
      if (!Number.isSafeInteger(ms) || ms < 0 || !Number.isFinite(new Date(milliseconds + ms).getTime()))
        throw new Error('Invalid fixture time advance');
      milliseconds += ms;
    },
    nextId(namespace: string) {
      if (!/^[a-z][a-z0-9_-]*$/.test(namespace)) throw new Error('Invalid fixture namespace');
      const next = (counters.get(namespace) ?? 0) + 1;
      counters.set(namespace, next);
      return `${namespace}_${String(next).padStart(6, '0')}`;
    },
  };
}

/** Faults are explicitly armed and consumed once, with no random timing or shared global state. */
export function createFaultInjector() {
  const pending = new Map<string, Error[]>();
  const reached: string[] = [];
  return {
    arm(point: string, error: Error = new Error(`Injected fault: ${point}`)) {
      pending.set(point, [...(pending.get(point) ?? []), error]);
    },
    hit(point: string) {
      reached.push(point);
      const error = pending.get(point)?.shift();
      if (error) throw error;
    },
    history: () => [...reached],
  };
}
