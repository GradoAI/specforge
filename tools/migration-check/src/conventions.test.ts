import { describe, expect, it } from 'vitest';
import { checkConventions, type CatalogTable } from './conventions.js';

const compliant = (): CatalogTable => ({
  schema: 'identity',
  name: 'organization',
  comment: 'Organizations',
  rowSecurity: true,
  forceRowSecurity: true,
  columns: Object.entries({
    id: 'text',
    org_id: 'text',
    created_at: 'timestamp with time zone',
    updated_at: 'timestamp with time zone',
    created_by: 'text',
    version: 'integer',
  }).map(([name, type]) => ({ name, type, comment: name, notNull: true })),
  constraints: [
    { name: 'pk_organization', kind: 'p', definition: 'PRIMARY KEY (id)' },
    { name: 'ck_organization_id', kind: 'c', definition: "CHECK ((id ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'::text))" },
  ],
  indexes: [
    { name: 'pk_organization', constraint: true },
    { name: 'ix_organization_created', constraint: false },
  ],
  policies: [
    {
      using: "(org_id = current_setting('fasrun.org_id'::text, true))",
      withCheck: "(org_id = current_setting('fasrun.org_id'::text, true))",
    },
  ],
});

describe('D-9 catalog conventions', () => {
  it('TC-PLATFORM-029 reports every rule for a noncompliant table', () => {
    const table = compliant();
    table.columns = table.columns.filter((column) => column.name !== 'created_at');
    table.columns.push({ name: 'name', type: 'character varying(100)', notNull: true, comment: null });
    table.comment = null;
    table.rowSecurity = false;
    table.forceRowSecurity = false;
    const issues = checkConventions(table);
    expect(issues.map((issue) => issue.rule)).toEqual(
      expect.arrayContaining([
        'standard-column',
        'table-comment',
        'column-comment',
        'text-type',
        'row-security',
        'force-row-security',
      ]),
    );
    expect(issues.every((issue) => issue.table === 'identity.organization')).toBe(true);
  });

  it('accepts compliant metadata', () => expect(checkConventions(compliant())).toEqual([]));

  it('checks timestamps, floating types, named keys and indexes, nullability and the ID constraint', () => {
    const table = compliant();
    table.columns = table.columns.map((column) => ({ ...column, notNull: false }));
    table.columns.push(
      { name: 'other_at', type: 'timestamp without time zone', comment: 'time', notNull: true },
      { name: 'amount', type: 'double precision', comment: 'amount', notNull: true },
    );
    table.constraints = [{ name: 'wrong', kind: 'p', definition: 'PRIMARY KEY (org_id)' }];
    table.indexes = [{ name: 'wrong', constraint: false }];
    table.policies = [];
    expect(checkConventions(table).map((issue) => issue.rule)).toEqual(
      expect.arrayContaining([
        'standard-column-nullable',
        'timestamp-type',
        'float-type',
        'constraint-name',
        'index-name',
        'id-primary-key',
        'id-prefix-check',
        'organization-policy',
      ]),
    );
  });

  it('limits append-only and platform exceptions to their specified rules', () => {
    const table = compliant();
    table.columns = table.columns.filter((column) => !['org_id', 'updated_at', 'version'].includes(column.name));
    table.rowSecurity = false;
    table.forceRowSecurity = false;
    table.policies = [];
    expect(checkConventions(table, { platform: true, appendOnly: true })).toEqual([]);
    table.comment = null;
    table.constraints = [];
    expect(checkConventions(table, { platform: true, appendOnly: true }).map((issue) => issue.rule)).toEqual([
      'table-comment',
      'id-primary-key',
      'id-prefix-check',
    ]);
    expect(checkConventions(table).some((issue) => issue.rule === 'standard-column')).toBe(true);
  });
});

it('TC-PLATFORM-029 rejects weakened ID checks and permissive policy bypasses', () => {
  const id = compliant();
  id.constraints[1]!.definition = "CHECK ((id ~ '^org_[0-9A-HJKMNP-TV-Z]{26}$'::text) OR true)";
  expect(checkConventions(id).map((x) => x.rule)).toContain('id-prefix-check');
  const policy = compliant();
  policy.policies[0]!.using = "org_id = current_setting('fasrun.org_id'::text,true) OR true";
  expect(checkConventions(policy).map((x) => x.rule)).toContain('organization-policy');
  const extra = compliant();
  extra.policies.push({ using: 'true', withCheck: 'true', permissive: true });
  expect(checkConventions(extra).map((x) => x.rule)).toContain('organization-policy');
  const selectOnly = compliant();
  selectOnly.policies[0]!.command = 'r';
  expect(checkConventions(selectOnly).map((x) => x.rule)).toContain('organization-policy');
});
it('TC-PLATFORM-029 preserves SQL literals while canonicalizing catalog expressions', () => {
  const table = compliant();
  table.policies[0]!.using = "org_id = current_setting('fasrun. org_id', true)";
  expect(checkConventions(table).map((x) => x.rule)).toContain('organization-policy');
  table.policies[0]!.using = "org_id = current_setting('fasrun.org_id::text', true)";
  expect(checkConventions(table).map((x) => x.rule)).toContain('organization-policy');
});
