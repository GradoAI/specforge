import { expect, it } from 'vitest';
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { idCheck } from './database.js';

it('builds a literal prefixed-id CHECK and rejects SQL or regex syntax in a prefix', () => {
  const table = pgTable('example', { id: text('id') });
  const query = new PgDialect().sqlToQuery(idCheck(table.id, 'org'));
  expect(query.sql).toBe('"example"."id" ~ \'^org_[0-9A-HJKMNP-TV-Z]{26}$\'');
  expect(query.params).toEqual([]);
  for (const prefix of ["org' OR true --", 'org.*', '', 'ORG'])
    expect(() => idCheck(table.id, prefix)).toThrow('prefix');
});
