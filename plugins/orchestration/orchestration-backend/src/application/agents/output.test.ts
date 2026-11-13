import { expect, it } from 'vitest';
import { z } from 'zod';
import type { JsonValue } from '@fasrun/contracts-core';
import { sanitizeOutput } from './output.js';
it('TC-CF-013 strips nested control paths and preserves prose only as data', () => {
  const s = z.strictObject({
    text: z.string(),
    nested: z.strictObject({ v: z.number() }),
    rows: z.array(z.strictObject({ id: z.string() })),
  });
  expect(
    sanitizeOutput(s, { text: 'approved', gates: [], nested: { v: 2, reviewers: [] }, rows: [{ id: 'a', steps: [] }] }),
  ).toEqual({
    output: { text: 'approved', nested: { v: 2 }, rows: [{ id: 'a' }] },
    stripped: ['output/gates', 'output/nested/reviewers', 'output/rows/0/steps'],
  });
});
it('TC-SF5-SPEC-013 validates independently projected union branches', () => {
  const s = z.union([
    z.strictObject({ kind: z.literal('q'), q: z.string() }),
    z.strictObject({ kind: z.literal('d'), d: z.string() }),
  ]);
  expect(sanitizeOutput(s, { kind: 'd', d: 'text', q: 4, steps: [] })).toEqual({
    output: { kind: 'd', d: 'text' },
    stripped: ['output/q', 'output/steps'],
  });
  expect(() => sanitizeOutput(s, { kind: 'd', d: 4 })).toThrow('union branch');
});
it('TC-SF5-SPEC-013 retains optional nullable defaults and strict type validation', () => {
  const s = z.strictObject({
    x: z.strictObject({ a: z.string() }).nullable().optional(),
    y: z.array(z.number()),
    count: z.number().default(1),
  });
  expect(sanitizeOutput(s, { x: null, y: [2] }).output).toEqual({ x: null, y: [2], count: 1 });
  expect(sanitizeOutput(s, { x: { a: 'ok', hidden: 1 }, y: [], count: 3 }).stripped).toEqual(['output/x/hidden']);
  for (const v of [{ y: ['2'] }, { y: [], count: false }, { y: [], x: undefined }])
    expect(() => sanitizeOutput(s, v)).toThrow();
  expect(() => sanitizeOutput(z.string().transform((v) => v) as z.ZodType<JsonValue>, 'x')).toThrow();
});
it('TC-CF-013 bounds and escapes audit paths and prevents prototype projection', () => {
  const v: unknown = JSON.parse('{"kept":"ok","__proto__":{"steps":[]},"a/b~c":1}');
  expect(sanitizeOutput(z.strictObject({ kept: z.string() }), v)).toEqual({
    output: { kept: 'ok' },
    stripped: ['output/__proto__', 'output/a~1b~0c'],
  });
  expect(
    sanitizeOutput(z.object({}), Object.fromEntries(Array.from({ length: 200 }, (_, n) => ['x' + n, 'secret'])))
      .stripped,
  ).toHaveLength(128);
});
it('TC-SF5-SPEC-013 bounds schema projection depth', () => {
  let s: z.ZodType<JsonValue> = z.string();
  let v: JsonValue = 'x';
  for (let i = 0; i < 66; i++) {
    s = z.array(s);
    v = [v];
  }
  expect(() => sanitizeOutput(s, v)).toThrow('nesting limit');
});

it('TC-CF-013 projects explicitly declared map values and readonly wrappers, rejects unsupported compositions', () => {
  const schema = z.record(z.string(), z.strictObject({ title: z.string() }).readonly());
  expect(sanitizeOutput(schema, { first: { title: 'ok', plan: [] } })).toEqual({
    output: { first: { title: 'ok' } },
    stripped: ['output/first/plan'],
  });
  expect(() => sanitizeOutput(z.tuple([z.object({})]), [{}])).toThrow('Unsupported');
  expect(() => sanitizeOutput(z.intersection(z.object({}), z.object({})), {})).toThrow('Unsupported');
});
