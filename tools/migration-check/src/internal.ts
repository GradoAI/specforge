import type { Table } from './catalog.js';
import type { ConventionViolation } from './conventions.js';
export const INTERNAL_TABLES = ['schema_migration', 'base_data_sync'] as const;
export function checkInternal(tables: Table[], schemas: string[]): ConventionViolation[] {
  const issues: ConventionViolation[] = [];
  for (const schema of schemas)
    for (const name of INTERNAL_TABLES) {
      const table = tables.find((t) => t.schema === schema && t.name === name);
      const fail = (rule: string, detail: string) =>
        issues.push({ table: `${schema}.${name}`, rule: `internal-${rule}`, detail });
      if (!table) {
        fail('missing', 'required executor table');
        continue;
      }
      const expected =
        name === 'schema_migration'
          ? { filename: 'text', hash: 'text', executed_at: 'timestamp with time zone' }
          : { key: 'text', version: 'bigint', synced_at: 'timestamp with time zone' };
      if (table.columns.length !== 3) fail('fields', 'expected exactly three executor columns');
      for (const [column, type] of Object.entries(expected)) {
        const actual = table.columns.find((c) => c.name === column);
        if (!actual || actual.type !== type || !actual.notNull)
          fail('column', `${column}: expected ${type} NOT NULL, got ${actual?.type ?? 'missing'}`);
      }
      const key = name === 'schema_migration' ? 'filename' : 'key';
      if (table.primaryColumns.length !== 1 || table.primaryColumns[0] !== key)
        fail('primary-key', `expected only ${key}`);
      if (table.owner !== 'fasrun_owner') fail('owner', `expected fasrun_owner, got ${table.owner}`);
      if (table.appAccess)
        fail('app-privileges', 'fasrun_app has effective table or column privileges (including PUBLIC/inheritance)');
    }
  return issues;
}
