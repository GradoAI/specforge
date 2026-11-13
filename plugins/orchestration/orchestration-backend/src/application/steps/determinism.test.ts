import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { z } from 'zod';
import type { StepDefinition } from '@fasrun/plugin-orchestration-node';
import { createStepCatalog, type SystemStep } from './catalog.js';
const stable: SystemStep = (input) => Promise.resolve({ output: input, metadata: { clock: Date.now() } });
function definition(execute = stable, version = '1'): StepDefinition {
  return {
    plugin: 'spec',
    name: 'normalize',
    implementationVersion: version,
    outputSchemaVersion: 'schema-v1',
    kind: 'system',
    input: z.strictObject({ value: z.number() }),
    output: z.strictObject({ value: z.number() }),
    permissions: ['spec.read'],
    cost: 0,
    maxAttempts: 1,
    timeoutMs: 1000,
    determinismEvidence: {
      testId: 'TC-CF-019',
      implementationHash: createHash('sha256').update(execute.toString()).digest('hex'),
    },
  };
}
it('TC-CF-019 enumerates all registered versions and ignores changing metadata', async () => {
  const c = createStepCatalog();
  for (const v of ['1', '2']) {
    const r = await c.verify(definition(stable, v), stable, [{ value: 1 }, { value: 2 }]);
    c.register(r.definition);
  }
  expect(c.list()).toHaveLength(2);
  for (const s of c.list()) {
    const f = c.systemImplementation(s);
    for (const i of c.verification(s).inputs) expect((await f(i)).output).toEqual((await f(i)).output);
    const e = c.verification(s);
    e.inputs.length = 0;
    expect(c.verification(s).inputs).toHaveLength(2);
  }
  expect(c.resolve('spec', 'normalize', '1').implementationVersion).toBe('1');
  expect(() => c.resolve('spec', 'normalize', '3')).toThrow('Unknown');
});
it('TC-CF-019 rejects fabricated/copied proof, mutation and duplicate versions', async () => {
  const c = createStepCatalog(),
    d = definition();
  expect(() => c.register(d)).toThrow('verified');
  const v = await c.verify(d, stable, [{ value: 1 }]);
  expect(() => c.register({ ...v.definition })).toThrow('verified');
  c.register(v.definition);
  expect(() => c.register(v.definition)).toThrow('already');
  expect(() => c.systemImplementation(d)).toThrow('Unregistered');
  expect(() => c.verification(d)).toThrow('Unregistered');
  expect(() => {
    (c.resolve('spec', 'normalize', '1').permissions as string[]).push('admin');
  }).toThrow();
  expect(() => {
    (d.output as z.ZodObject).shape.value = z.string();
  }).toThrow();
});
it('TC-CF-019 verification cannot overwrite registered implementation/evidence', async () => {
  const c = createStepCatalog();
  const a = await c.verify(definition(), stable, [{ value: 1 }]);
  c.register(a.definition);
  const f: SystemStep = () => Promise.resolve({ output: { value: 9 } });
  const b = await c.verify(definition(f), f, [{ value: 2 }]);
  expect(() => c.register(b.definition)).toThrow('already');
  const s = c.resolve('spec', 'normalize', '1');
  expect(c.systemImplementation(s)).toBe(stable);
  expect(c.verification(s).inputs).toEqual([{ value: 1 }]);
});
it('TC-CF-019 rejects nondeterminism, bad schema input and invalid definitions', async () => {
  let n = 0;
  const f: SystemStep = () => Promise.resolve({ output: { value: ++n } });
  const c = createStepCatalog();
  await expect(c.verify(definition(f), f, [{ value: 1 }])).rejects.toThrow('Non-deterministic');
  await expect(c.verify(definition(), stable, [])).rejects.toThrow('cases');
  const withoutEvidence = definition();
  delete (withoutEvidence as { determinismEvidence?: unknown }).determinismEvidence;
  await expect(c.verify(withoutEvidence, stable, [{ value: 1 }])).rejects.toThrow('cases');
  await expect(c.verify(definition(), f, [{ value: 1 }])).rejects.toThrow('mismatch');
  await expect(c.verify(definition(), stable, [{ value: 'wrong' }])).rejects.toThrow();
  for (const bad of [
    { cost: -1 },
    { maxAttempts: 0 },
    { timeoutMs: 0 },
    { plugin: '' },
    { name: '' },
    { implementationVersion: '' },
    { outputSchemaVersion: '' },
    { permissions: [''] },
  ])
    expect(() => c.register({ ...definition(), kind: 'agent', ...bad })).toThrow('Invalid');
  const a = { ...definition(), kind: 'agent' as const };
  c.register(a);
  const s = c.resolve('spec', 'normalize', '1');
  expect(() => c.systemImplementation(s)).toThrow('No registered');
  expect(() => c.verification(s)).toThrow('No determinism');
  await expect(c.verify(a, stable, [{ value: 1 }])).rejects.toThrow('cases');
});
