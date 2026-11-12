import { describe, expect, it } from 'vitest';
import type { Table } from './catalog.js';
import { checkInternal } from './internal.js';

const executorTables = (schema = 'identity'): Table[] =>
  [
    {
      name: 'schema_migration',
      fields: { filename: 'text', hash: 'text', executed_at: 'timestamp with time zone' },
      key: 'filename',
    },
    {
      name: 'base_data_sync',
      fields: { key: 'text', version: 'bigint', synced_at: 'timestamp with time zone' },
      key: 'key',
    },
  ].map(({ name, fields, key }) => ({
    schema,
    name,
    owner: 'fasrun_owner',
    appAccess: false,
    primaryColumns: [key],
    comment: null,
    rowSecurity: false,
    forceRowSecurity: false,
    columns: Object.entries(fields).map(([column, type]) => ({ name: column, type, notNull: true, comment: null })),
    constraints: [],
    indexes: [],
    policies: [],
  }));

describe('TC-PLATFORM-068 executor internal tables', () => {
  it('accepts both exact executor structures in every requested plugin schema without business columns, comments or RLS', () => {
    expect(checkInternal([...executorTables(), ...executorTables('work')], ['identity', 'work'])).toEqual([]);
  });

  it('requires both tables independently in every requested schema', () => {
    expect(checkInternal(executorTables(), ['identity', 'work'])).toEqual([
      expect.objectContaining({ table: 'work.schema_migration', rule: 'internal-missing' }),
      expect.objectContaining({ table: 'work.base_data_sync', rule: 'internal-missing' }),
    ]);
  });

  for (const name of ['schema_migration', 'base_data_sync']) {
    const mutate = (change: (table: Table) => void) => {
      const tables = executorTables();
      const table = tables.find((item) => item.name === name)!;
      change(table);
      return checkInternal(tables, ['identity']);
    };
    const rejects = (change: (table: Table) => void, rule: string) => {
      expect(mutate(change)).toEqual(
        expect.arrayContaining([expect.objectContaining({ table: `identity.${name}`, rule })]),
      );
    };

    it(`${name}: reports a missing expected column`, () => {
      rejects((table) => {
        table.columns.pop();
      }, 'internal-column');
    });

    it(`${name}: reports an extra column even when all expected columns remain valid`, () => {
      rejects((table) => {
        table.columns.push({ name: 'extra', type: 'text', notNull: true, comment: null });
      }, 'internal-fields');
    });

    it(`${name}: rejects a domain in place of the exact built-in type`, () => {
      rejects((table) => {
        table.columns[0]!.type = 'identity.executor_text';
      }, 'internal-column');
    });

    it(`${name}: rejects nullable executor fields`, () => {
      for (let index = 0; index < 3; index++) {
        rejects((table) => {
          table.columns[index]!.notNull = false;
        }, 'internal-column');
      }
    });

    it(`${name}: rejects missing, wrong and composite primary keys`, () => {
      for (const primaryColumns of [[], ['other'], [name === 'schema_migration' ? 'filename' : 'key', 'extra']]) {
        rejects((table) => {
          table.primaryColumns = primaryColumns;
        }, 'internal-primary-key');
      }
    });

    it(`${name}: requires fasrun_owner ownership`, () => {
      rejects((table) => {
        table.owner = 'fasrun_app';
      }, 'internal-owner');
    });

    it(`${name}: rejects effective application privileges`, () => {
      rejects((table) => {
        table.appAccess = true;
      }, 'internal-app-privileges');
    });
  }

  it.each([
    ['schema_migration', 'filename', 'character varying'],
    ['schema_migration', 'hash', 'character varying(64)'],
    ['schema_migration', 'executed_at', 'timestamp without time zone'],
    ['base_data_sync', 'key', 'character varying'],
    ['base_data_sync', 'version', 'integer'],
    ['base_data_sync', 'version', 'numeric'],
    ['base_data_sync', 'synced_at', 'timestamp without time zone'],
  ])('rejects approximate type %s.%s = %s', (name, column, type) => {
    const tables = executorTables();
    tables.find((table) => table.name === name)!.columns.find((field) => field.name === column)!.type = type;
    expect(checkInternal(tables, ['identity'])).toEqual([
      expect.objectContaining({ table: `identity.${name}`, rule: 'internal-column' }),
    ]);
  });

  it('checks exact table names only; a similarly named table cannot replace either required table', () => {
    const similar = executorTables().map((table) => ({
      ...table,
      name: `${table.name}_backup`,
      owner: 'fasrun_app',
      appAccess: true,
    }));
    expect(checkInternal([...executorTables(), ...similar], ['identity'])).toEqual([]);
    expect(checkInternal(similar, ['identity'])).toEqual([
      expect.objectContaining({ table: 'identity.schema_migration', rule: 'internal-missing' }),
      expect.objectContaining({ table: 'identity.base_data_sync', rule: 'internal-missing' }),
    ]);
  });
});
