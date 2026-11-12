import { describe, expect, it } from 'vitest';
import { isId, newId } from './ids.js';

describe('prefixed identifiers (R-platform-007.S1)', () => {
  it('TC-PLATFORM-021 generates org identifiers with a ULID timestamp and random suffix', () => {
    const before = Date.now();
    const ids = Array.from({ length: 1000 }, () => newId('org'));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^org_[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(isId('org', id)).toBe(true);
      const time = [...id.slice(4, 14)].reduce((n, c) => n * 32 + '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.indexOf(c), 0);
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(Date.now());
    }
  });
  it('rejects wrong prefixes, lengths, case, excluded letters and non-string values', () => {
    for (const value of [
      null,
      42,
      {},
      newId('wrk'),
      'org_',
      `${newId('org')}\n`,
      `org_${'I'.repeat(26)}`,
      newId('org').toLowerCase(),
      `${newId('org')}0`,
    ]) {
      expect(isId('org', value)).toBe(false);
    }
    for (const prefix of ['', 'ORG', 'org_', `${newId('org')}\n`, 'org.*', "org'"])
      expect(() => newId(prefix)).toThrow('prefix');
  });
});
