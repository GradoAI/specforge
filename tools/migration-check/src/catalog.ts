import type pg from 'pg';
import type { CatalogTable } from './conventions.js';
export interface Table extends CatalogTable {
  owner: string;
  appAccess: boolean;
  primaryColumns: string[];
}
export async function catalog(client: pg.Client, schemas: string[]): Promise<Table[]> {
  const tables = await client.query<{
    oid: number;
    schema: string;
    name: string;
    owner: string;
    comment: string | null;
    rowSecurity: boolean;
    forceRowSecurity: boolean;
    appAccess: boolean;
  }>(
    `
  select c.oid,n.nspname as schema,c.relname as name,pg_get_userbyid(c.relowner) as owner,
    obj_description(c.oid,'pg_class') as comment,c.relrowsecurity as "rowSecurity",c.relforcerowsecurity as "forceRowSecurity",
    has_table_privilege('fasrun_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or
    has_any_column_privilege('fasrun_app',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') as "appAccess"
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname=any($1) and c.relkind in ('r','p','f') order by n.nspname,c.relname`,
    [schemas],
  );
  const result: Table[] = [];
  for (const table of tables.rows) {
    const columns = await client.query<Table['columns'][number]>(
      `select a.attname as name,case when t.typnamespace='pg_catalog'::regnamespace and t.typtype='b' then format_type(a.atttypid,a.atttypmod) else format('%I.%I',tn.nspname,t.typname) end as type,col_description(a.attrelid,a.attnum) as comment,a.attnotnull as "notNull" from pg_attribute a join pg_type t on t.oid=a.atttypid join pg_namespace tn on tn.oid=t.typnamespace where a.attrelid=$1 and a.attnum>0 and not a.attisdropped order by a.attnum`,
      [table.oid],
    );
    const constraints = await client.query<Table['constraints'][number]>(
      `select conname as name,contype as kind,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid=$1`,
      [table.oid],
    );
    const primary = await client.query<{ name: string }>(
      `select a.attname as name from pg_constraint c cross join lateral unnest(c.conkey) with ordinality as k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num where c.conrelid=$1 and c.contype='p' order by k.ord`,
      [table.oid],
    );
    const indexes = await client.query<Table['indexes'][number]>(
      `select c.relname as name,exists(select 1 from pg_constraint x where x.conindid=i.indexrelid) as constraint from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid=$1`,
      [table.oid],
    );
    const policies = await client.query<Table['policies'][number]>(
      `select polcmd as command,polpermissive as permissive,pg_get_expr(polqual,polrelid) as using,pg_get_expr(polwithcheck,polrelid) as "withCheck" from pg_policy where polrelid=$1`,
      [table.oid],
    );
    result.push({
      ...table,
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      policies: policies.rows,
      primaryColumns: primary.rows.map((x) => x.name),
    });
  }
  return result;
}
