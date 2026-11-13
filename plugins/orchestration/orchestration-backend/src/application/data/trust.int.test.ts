import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { newId } from '@fasrun/contracts-core';
import { canonicalData } from '@fasrun/plugin-orchestration-common';
import { createDataService } from './service.js';
import { dataFixture } from './test-fixture.js';
describe('TC-CF-015 trust propagation and current human confirmation', () => {
  const { fixture: f, request } = dataFixture();
  it('rejects self-attested producers even with trusted input and binds provenance to exact output', async () => {
    const source = request();
    source.labels.source = { kind: 'trusted_source', id: 'catalog' };
    const approvedHash = createHash('sha256').update(JSON.stringify(source.value)).digest('hex');
    const service = createDataService({
      ...f.deps!,
      trustedProducer: (actor, output) =>
        Promise.resolve(
          actor.actor.actorId === f.context.actor.actorId &&
            output.contentHash === approvedHash &&
            canonicalData(output.labels) === canonicalData(source.labels) &&
            output.inputRefs.length === 0,
        ),
    });
    const trusted = await service.register(f.context, source);
    expect(trusted.labels.trust).toBe('trusted');
    expect(
      (await service.register(f.context, { ...source, labels: { ...source.labels, classification: 'public' } })).labels
        .trust,
    ).toBe('untrusted');
    const derived = request({ value: 'new arbitrary content', inputs: [trusted] });
    derived.labels.source = { kind: 'system', id: 'catalog' };
    expect((await service.register(f.context, derived)).labels.trust).toBe('untrusted');
    const agent = { ...f.context, actor: { ...f.context.actor, actorKind: 'agent' as const, actorId: newId('agent') } };
    expect((await service.register(agent, source)).labels.trust).toBe('untrusted');
    const external = request();
    external.labels.trust = 'trusted';
    expect((await service.register(f.context, external)).labels.trust).toBe('untrusted');
    const original = await f.service!.register(f.context, request());
    const mixed = request({ inputs: [original, trusted] });
    mixed.labels.source = { kind: 'system', id: 'checker' };
    f.trusted = true;
    expect((await f.service!.register(f.context, mixed)).labels.trust).toBe('untrusted');
    f.trusted = false;
  });
  it('binds producer evidence to a snapshot even if the caller mutates its object while attestation awaits', async () => {
    const input = request();
    input.labels.source = { kind: 'trusted_source', id: 'catalog' };
    const original = JSON.parse(JSON.stringify(input.value)) as typeof input.value;
    const service = createDataService({
      ...f.deps!,
      trustedProducer: () => {
        input.value = 'replaced after proof';
        input.labels.classification = 'public';
        return Promise.resolve(true);
      },
    });
    const ref = await service.register(f.context, input);
    expect(ref.labels.classification).toBe('repository');
    expect((await service.read({ context: f.context, ref })).value).toEqual(original);
  });
  it('creates a new confirmed version without modifying old labels; rejects wrong head/member/ref and revoked approvals', async () => {
    const ref = await f.service!.register(f.context, request());
    const confirmed = await f.service!.confirm(f.context, ref, 'current-head');
    expect(confirmed.versionHash).not.toBe(ref.versionHash);
    expect(confirmed.labels.confirmation).toEqual({
      kind: 'human',
      memberId: f.context.actor.actorId,
      headCommit: 'current-head',
      originalRef: ref.id,
      basis: 'current human review fixture',
    });
    expect((await f.service!.read({ context: f.context, ref })).ref.labels.trust).toBe('untrusted');
    expect((await f.service!.read({ context: f.context, ref: confirmed })).value).toEqual(
      (await f.service!.read({ context: f.context, ref })).value,
    );
    for (const replacement of [{ memberId: 'other' }, { headCommit: 'old' }, { originalRef: 'wrong' }, { basis: '' }]) {
      const service = createDataService({
        ...f.deps!,
        confirmation: async (...args) => ({ ...(await f.deps!.confirmation(...args)), ...replacement }),
      });
      await expect(service.confirm(f.context, ref, 'current-head')).rejects.toThrow('denied');
    }
    const revoked = createDataService({
      ...f.deps!,
      confirmation: async (...args) => {
        const proof = await f.deps!.confirmation(...args);
        f.revoked = true;
        return proof;
      },
    });
    await expect(revoked.confirm(f.context, ref, 'current-head')).rejects.toThrow('denied');
    f.revoked = false;
    await expect(
      f.service!.confirm({ ...f.context, actor: { ...f.context.actor, actorKind: 'agent' } }, ref, 'current-head'),
    ).rejects.toThrow('denied');
    const self = request();
    self.labels = confirmed.labels;
    await expect(f.service!.register(f.context, self)).rejects.toThrow('denied');
  });
});
