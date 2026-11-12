/** Values obtained from pg_catalog; never infer compliance from migration text. */
export interface CatalogTable {
  schema: string;
  name: string;
  comment: string | null;
  rowSecurity: boolean;
  forceRowSecurity: boolean;
  columns: { name: string; type: string; comment: string | null; notNull: boolean }[];
  constraints: { name: string; kind: string; definition: string }[];
  indexes: { name: string; constraint: boolean }[];
  policies: { using: string | null; withCheck: string | null; command?: string; permissive?: boolean }[];
}

/** D-9: exported beside a Drizzle table definition; neither exception disables other rules. */
export interface TableException {
  appendOnly?: boolean;
  platform?: boolean;
}

export interface ConventionViolation {
  table: string;
  rule: string;
  detail: string;
}

export function checkConventions(table: CatalogTable, exception: TableException = {}): ConventionViolation[] {
  const violations: ConventionViolation[] = [];
  const fail = (rule: string, detail: string) => {
    violations.push({ table: `${table.schema}.${table.name}`, rule, detail });
  };
  const required: Record<string, string> = { id: 'text', created_at: 'timestamp with time zone', created_by: 'text' };
  if (!exception.platform) required.org_id = 'text';
  if (!exception.appendOnly) {
    required.updated_at = 'timestamp with time zone';
    required.version = 'integer';
  }
  for (const [name, type] of Object.entries(required)) {
    const column = table.columns.find((item) => item.name === name);
    if (!column) fail('standard-column', `missing ${name}`);
    else {
      if (column.type !== type) fail('standard-column-type', `${name}: expected ${type}, got ${column.type}`);
      if (!column.notNull) fail('standard-column-nullable', name);
    }
  }
  if (!table.comment?.trim()) fail('table-comment', 'missing COMMENT');
  for (const column of table.columns) {
    if (!column.comment?.trim()) fail('column-comment', `${column.name}: missing COMMENT`);
    if (/^(character varying|character)(\(|$)/.test(column.type)) fail('text-type', column.name);
    if (['real', 'double precision'].includes(column.type)) fail('float-type', column.name);
    if (
      column.type === 'timestamp without time zone' ||
      (column.name.endsWith('_at') && column.type !== 'timestamp with time zone')
    ) {
      fail('timestamp-type', `${column.name}: use timestamptz`);
    }
  }
  const prefixes: Record<string, string> = { p: 'pk_', f: 'fk_', u: 'uq_', c: 'ck_', x: 'ck_' };
  for (const constraint of table.constraints) {
    const prefix = prefixes[constraint.kind];
    if (prefix && !constraint.name.startsWith(prefix))
      fail('constraint-name', `${constraint.name}: expected ${prefix}`);
  }
  for (const index of table.indexes) {
    if (!index.constraint && !index.name.startsWith('ix_')) fail('index-name', index.name);
  }
  if (!table.constraints.some((item) => item.kind === 'p' && /PRIMARY KEY\s*\("?id"?\)/i.test(item.definition))) {
    fail('id-primary-key', 'id must be the primary key');
  }
  // Compare complete canonical expressions, never just presence of org_id / an ID regex.
  // pg_catalog adds parentheses and ::text casts; neither changes these exact expressions.
  const canonical = (value: string) =>
    value.replace(/'(?:''|[^'])*'|::text|[\s"()]/g, (token) => (token.startsWith("'") ? token : ''));
  if (
    !table.constraints.some(
      (item) =>
        item.kind === 'c' &&
        /^CHECKid~'\^[a-z][a-z0-9]*_\[0-9A-HJKMNP-TV-Z\]\{26\}\$'$/.test(canonical(item.definition)),
    )
  ) {
    fail('id-prefix-check', 'missing exact prefixed ULID CHECK on id');
  }
  if (!exception.platform) {
    if (!table.rowSecurity) fail('row-security', 'ENABLE ROW LEVEL SECURITY required');
    if (!table.forceRowSecurity) fail('force-row-security', 'FORCE ROW LEVEL SECURITY required');
    const scoped = (expression: string | null) =>
      expression !== null && canonical(expression) === "org_id=current_setting'fasrun.org_id',true";
    const scopedPolicy = (policy: CatalogTable['policies'][number]) => scoped(policy.using) && scoped(policy.withCheck);
    if (
      !table.policies.some(
        (policy) => scopedPolicy(policy) && (policy.command === undefined || policy.command === '*'),
      ) ||
      table.policies.some((policy) => policy.permissive !== false && !scopedPolicy(policy))
    ) {
      fail('organization-policy', 'all-command organization scope required; permissive policies cannot bypass it');
    }
  }
  return violations;
}
