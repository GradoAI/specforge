import { expect, it } from 'vitest';
import { parseDiff, safeDetail } from './check.js';
it('TC-PLATFORM-030 fails closed on missing schemas and malformed worker output', () => {
  for (const json of [
    '{}',
    'null',
    '[]',
    '{"identity":null}',
    '{"identity":[1]}',
    '{"identity":[],"extra":[]}',
    'not JSON',
  ])
    expect(() => parseDiff(json, ['identity'])).toThrow();
  expect(parseDiff('{"identity":[]}', ['identity'])).toEqual({ identity: [] });
});
it('redacts database credentials in upstream diagnostics', () => {
  expect(safeDetail('cannot connect postgres://owner:secret@example.test/db')).toBe(
    'cannot connect [redacted database URL]',
  );
});
