import { describe, it, expect } from 'vitest';
import { createDataService } from './service.js';
import { dataFixture } from './test-fixture.js';
describe('TC-CF-016 / TC-SF5-ENTRY-008 labelled outbound and serialization', () => {
  const { fixture: f, request } = dataFixture();
  it('blocks excluded model data while independent branch succeeds and retains labels in JSON', async () => {
    const excluded = request();
    excluded.labels.excludedChannels = ['model'];
    const bad = await f.service!.register(f.context, excluded),
      good = await f.service!.register(f.context, request());
    let badEffects = 0,
      goodEffects = 0;
    const results = await Promise.allSettled([
      f.service!.outbound(f.context, [bad], 'model', () => {
        badEffects++;
        return Promise.resolve('bad');
      }),
      f.service!.outbound(f.context, [good], 'authorized-channel', (values) => {
        goodEffects++;
        return Promise.resolve(JSON.parse(JSON.stringify(values)));
      }),
    ]);
    expect(results[0]?.status).toBe('rejected');
    expect(badEffects).toBe(0);
    expect(goodEffects).toBe(1);
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: [{ ref: good }] });
    f.policyAllowed = false;
    await expect(
      f.service!.outbound(f.context, [good], 'unauthorized-repository-channel', () => Promise.resolve('leak')),
    ).rejects.toThrow('denied');
    f.policyAllowed = true;
    for (const channel of ['', 'internal', 'https://user:secret@private'])
      await expect(f.service!.outbound(f.context, [good], channel, () => Promise.resolve())).rejects.toThrow('denied');
    expect(
      f.audits.some(
        (event) =>
          event.action === 'orchestration.data.outbound' &&
          event.details.reason === 'channel-excluded' &&
          (event.details.references as string[]).includes(bad.id),
      ),
    ).toBe(true);
    await expect(
      f.service!.outbound(f.context, [good], 'channel', () => Promise.reject(new Error('private callback failure'))),
    ).rejects.toThrow('denied');
    expect(
      f.audits.some((event) => event.outcome === 'failed' && event.details.reason === 'outbound-effect-failed'),
    ).toBe(true);
    expect(JSON.stringify(f.audits)).not.toContain('private callback failure');
  });
  it('checks authorization again after durable read intent and before outbound effect', async () => {
    const ref = await f.service!.register(f.context, request());
    let effects = 0;
    const service = createDataService({
      ...f.deps!,
      audit: async (event) => {
        await f.deps!.audit(event);
        if (event.action === 'orchestration.data.outbound-intent') f.revoked = true;
      },
    });
    await expect(
      service.outbound(f.context, [ref], 'channel', () => {
        effects++;
        return Promise.resolve();
      }),
    ).rejects.toThrow('denied');
    expect(effects).toBe(0);
    f.revoked = false;
    const read = createDataService({
      ...f.deps!,
      audit: async (event) => {
        await f.deps!.audit(event);
        f.revoked = true;
      },
    });
    await expect(read.read({ context: f.context, ref })).rejects.toThrow('denied');
    f.revoked = false;
  });
});
