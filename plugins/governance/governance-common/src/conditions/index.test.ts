import { describe, expect, it } from 'vitest';
import {
  evaluateConditionExpression as evaluate,
  validateConditionExpression as validate,
  type ConditionContext,
} from './index.js';
const atom = (condition: string, params: Record<string, unknown> = {}) => ({ condition, params });
const rule = (condition: string, params: Record<string, unknown> = {}) => ({ must: [atom(condition, params)] });
const context: ConditionContext = {
  subject: { id: 'alice', teamIds: ['team'], groupIds: ['group'], roles: ['reviewer'] },
  domains: {
    trigger: ['alice'],
    requirements_reviewer: ['alice'],
    design_reviewer: ['alice'],
    independent_reviewer: ['alice'],
    machine_owner: ['alice'],
    subscriber: ['alice'],
  },
  relations: { trigger: 'bob', proposer: 'alice', applicant: null },
  issue: { type: 'bug', labels: ['urgent'], status: 'open', priority: 'high' },
  source: { repository: 'fasrun/core', path: 'src/main.ts', external_system: 'github', event_type: 'opened' },
  senderIsBot: false,
  work: { size: 'small', confidence: 0.9, team: 'team', project: 'project' },
  numbers: { budget_usage_ratio: 0.95, queue_duration: 60, retry_count: 2, risk_score: 5 },
  instant: Date.parse('2026-11-09T10:00:00Z'),
};
const matched = (input: unknown, facts = context) => {
  const result = evaluate(input, facts);
  expect(result.valid).toBe(true);
  return result.matched;
};
describe('TC-SF5-GOVERNANCE-001 typed deterministic conditions', () => {
  it('implements the complete subject domain catalog on the current object', () => {
    for (const [domain, id] of [
      ['member', 'alice'],
      ['team', 'team'],
      ['group', 'group'],
      ['role', 'reviewer'],
    ]) {
      expect(matched(rule('subject_in_domain', { domain, id }))).toBe(true);
      expect(matched(rule('subject_in_domain', { domain, id: 'absent' }))).toBe(false);
    }
    for (const domain of Object.keys(context.domains!)) {
      expect(matched(rule('subject_in_domain', { domain }))).toBe(true);
      expect(
        matched(rule('subject_in_domain', { domain }), { ...context, domains: { ...context.domains, [domain]: [] } }),
      ).toBe(false);
    }
    for (const [relation, expected] of [
      ['trigger', true],
      ['proposer', false],
      ['applicant', true],
    ])
      expect(matched(rule('not_a_relation', { relation }))).toBe(expected);
    expect(
      matched(rule('not_a_relation', { relation: 'trigger' }), { ...context, relations: { trigger: 'alice' } }),
    ).toBe(false);
  });
  it('compares all allowed issue, source, work and number fields', () => {
    for (const [field, value] of Object.entries(context.issue!)) {
      expect(matched(rule('issue_field', { field, value: Array.isArray(value) ? value[0] : value }))).toBe(true);
      expect(matched(rule('issue_field', { field, value: 'other' }))).toBe(false);
    }
    for (const [field, value] of Object.entries(context.source!)) {
      expect(matched(rule('source', { field, value }))).toBe(true);
      expect(matched(rule('source', { field, value: 'other' }))).toBe(false);
    }
    for (const pattern of ['*', 'fasrun/*', '*core', 'f*run/c*e', '**/core'])
      expect(matched(rule('source', { field: 'repository', value: pattern }))).toBe(true);
    for (const pattern of ['fasrun', '.*', '(.*)', 'fasrun/cores', 'other*'])
      expect(matched(rule('source', { field: 'repository', value: pattern }))).toBe(false);
    for (const [field, value] of Object.entries(context.work!)) {
      expect(matched(rule('work_attribute', { field, value }))).toBe(true);
      expect(matched(rule('work_attribute', { field, value: field === 'confidence' ? 0 : 'other' }))).toBe(false);
    }
    for (const [field, value] of Object.entries(context.numbers!))
      expect(matched(rule('number_compare', { field, operator: 'eq', value }))).toBe(true);
    for (const [operator, value, expected] of [
      ['eq', 5, true],
      ['eq', 4, false],
      ['ne', 4, true],
      ['ne', 5, false],
      ['gt', 4, true],
      ['gt', 5, false],
      ['gte', 5, true],
      ['gte', 6, false],
      ['lt', 6, true],
      ['lt', 5, false],
      ['lte', 5, true],
      ['lte', 4, false],
    ])
      expect(matched(rule('number_compare', { field: 'risk_score', operator, value }))).toBe(expected);
    expect(matched(rule('sender_is_bot'))).toBe(false);
    expect(matched(rule('sender_is_bot'), { senderIsBot: true })).toBe(true);
  });
  it('uses explicit time, IANA timezone, ISO weekdays and half-open local windows including DST', () => {
    const window = (start: string, end: string, timezone = 'UTC', weekdays = [1]) =>
      rule('time_window', { weekdays, start, end, timezone });
    expect(matched(window('10:00', '11:00'))).toBe(true);
    expect(matched(window('09:00', '10:00'))).toBe(false);
    expect(matched(window('10:00', '10:00'))).toBe(false);
    expect(matched(window('11:00', '12:00'))).toBe(false);
    expect(matched(window('09:00', '11:00', 'UTC', [2]))).toBe(false);
    expect(matched(window('18:00', '19:00', 'Asia/Taipei'))).toBe(true);
    expect(matched(window('11:00', '12:00', '+01:00'))).toBe(true);
    expect(matched(window('22:00', '11:00'))).toBe(true);
    expect(matched(window('09:00', '08:00'))).toBe(true);
    expect(matched(window('22:00', '08:00'))).toBe(false);
    for (const instant of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z'])
      expect(matched(window('01:00', '02:00', 'America/New_York', [7]), { instant: Date.parse(instant) })).toBe(true);
  });
  it('reports every node result; defines empty boolean groups without bypassing object checks', () => {
    for (const [operator, expected] of [
      ['must', true],
      ['should', false],
      ['must_not', true],
    ])
      expect(matched({ [String(operator)]: [] })).toBe(expected);
    const yes = atom('not_a_relation', { relation: 'trigger' });
    const no = atom('sender_is_bot');
    for (const [operator, values, expected] of [
      ['must', [yes, no], false],
      ['should', [yes, no], true],
      ['must_not', [no], true],
      ['must_not', [yes, no], false],
    ] as const)
      expect(matched({ [String(operator)]: values })).toBe(expected);
    const result = evaluate({ must: [{ should: [yes, no] }, { must_not: [no] }] }, context);
    expect(result).toMatchObject({
      valid: true,
      matched: true,
      explanation: {
        path: '$',
        children: [
          { path: '$.must[0]', matched: true },
          { path: '$.must[1]', matched: true },
        ],
      },
    });
    expect(evaluate({ should: [{ must: [] }, atom('sender_is_bot')] }, {})).toMatchObject({
      valid: false,
      matched: false,
    });
    expect(evaluate({ must_not: [atom('not_a_relation', { relation: 'trigger' })] }, {})).toMatchObject({
      valid: false,
      matched: false,
    });
  });
  it('rejects malformed structures, unknown fields, injection and unbounded trees with paths', () => {
    const invalid = [
      null,
      { must: Array(1) },
      { must: [], [Symbol('hidden')]: true },
      Object.defineProperty({}, 'must', {
        enumerable: true,
        get() {
          throw new Error('must not execute');
        },
      }),
      Object.defineProperty({ must: [] }, 'hidden', { value: true }),
      [],
      'process.exit()',
      {},
      { must: [], should: [] },
      { must: 'true' },
      { must: Array(1025).fill(null) },
      { must: [null] },
      atom('sender_is_bot'),
      { must: [{ condition: 'sender_is_bot' }] },
      rule('__proto__'),
      rule('constructor'),
      { must: [{ condition: 3, params: {} }] },
      { must: [{ condition: 'sender_is_bot', params: [] }] },
      rule('sender_is_bot', { code: 'process.exit()' }),
      rule('issue_field', { field: 'body', value: 'execute' }),
      rule('issue_field', { field: 'type', value: 2 }),
      rule('source', { field: '__proto__.evil', value: 'x' }),
      rule('number_compare', { field: 'risk_score', operator: 'eval', value: 0 }),
      rule('number_compare', { field: 'risk_score', operator: 'eq', value: Infinity }),
      rule('subject_in_domain', { domain: 'team' }),
      rule('subject_in_domain', { domain: 'trigger', id: 'x' }),
      rule('subject_in_domain', { domain: 'code', id: 'x' }),
      rule('work_attribute', { field: 'confidence', value: 'high' }),
      rule('work_attribute', { field: 'size', value: 1 }),
      rule('time_window', { weekdays: [], start: '24:00', end: 'a', timezone: 'invalid/zone' }),
      rule('time_window', { weekdays: [0, 8, 1.5], start: '10:00', end: '11:00', timezone: 3 }),
      { must: [Object.create({ condition: 'sender_is_bot', params: {} })] },
    ];
    for (const input of invalid) {
      const result = validate(input);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
        for (const error of result.errors) expect(error.path).toMatch(/^\$/);
      }
      expect(evaluate(input, context)).toMatchObject({ valid: false, matched: false });
    }
    const error = validate(rule('issue_field', { field: 'body', value: 'x' }));
    expect(error).toMatchObject({ errors: [{ path: '$.must[0].params.field' }] });
    const nested = (depth: number): unknown => (depth === 1 ? atom('sender_is_bot') : { must: [nested(depth - 1)] });
    expect(validate(nested(5)).valid).toBe(true);
    expect(validate(nested(6)).valid).toBe(false);
    const cycle: { must: unknown[] } = { must: [] };
    cycle.must.push(cycle);
    expect(validate(cycle).valid).toBe(false);
    expect(validate({ must: Array.from({ length: 1024 }, () => atom('sender_is_bot')) }).valid).toBe(false);
    // Text values are literal data: they never execute or become semantic predicates.
    expect(matched(rule('issue_field', { field: 'type', value: 'globalThis.pwned = true' }))).toBe(false);
  });
  it('fails closed for missing or malformed context even under negation', () => {
    for (const node of [
      atom('subject_in_domain', { domain: 'team', id: 'x' }),
      atom('not_a_relation', { relation: 'trigger' }),
      atom('issue_field', { field: 'labels', value: 'x' }),
      atom('issue_field', { field: 'status', value: 'x' }),
      atom('source', { field: 'path', value: 'x' }),
      atom('sender_is_bot'),
      atom('work_attribute', { field: 'size', value: 'x' }),
      atom('number_compare', { field: 'risk_score', operator: 'eq', value: 1 }),
      atom('time_window', { weekdays: [1], start: '00:00', end: '01:00', timezone: 'UTC' }),
    ])
      expect(evaluate({ must_not: [node] }, {})).toMatchObject({ valid: false, matched: false });
    expect(evaluate(rule('subject_in_domain', { domain: 'trigger' }), { subject: context.subject! })).toMatchObject({
      valid: false,
    });
    expect(
      evaluate(rule('subject_in_domain', { domain: 'team', id: 'team' }), {
        subject: { ...context.subject!, teamIds: [3] as unknown as string[] },
      }),
    ).toMatchObject({ valid: false });
    expect(evaluate(rule('not_a_relation', { relation: 'trigger' }), { subject: context.subject! })).toMatchObject({
      valid: false,
    });
    expect(
      evaluate(rule('time_window', { weekdays: [1], start: '00:00', end: '01:00', timezone: 'UTC' }), {
        instant: 9e15,
      }),
    ).toMatchObject({ valid: false });
    const input = { must: [atom('sender_is_bot')] };
    const before = JSON.stringify({ input, context });
    expect(evaluate(input, context)).toEqual(evaluate(input, context));
    expect(JSON.stringify({ input, context })).toBe(before);
  });
});
