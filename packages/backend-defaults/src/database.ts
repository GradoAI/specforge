import type { DatabaseService } from '@fasrun/backend-plugin-api';
import { ErrorCodes, FasrunError, idPattern, isId } from '@fasrun/contracts-core';
import { sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export type OrganizationTransaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** Use inside check('ck_<table>_id', idCheck(table.id, prefix)). The validated pattern is DDL, not a bind parameter. */
export function idCheck(column: AnyPgColumn, prefix: string): SQL {
  return sql`${column} ~ ${sql.raw(`'${idPattern(prefix)}'`)}`;
}

/** Binds the existing database service to an organization transaction API without changing its shared contract. */
export function organizationDatabase(database: Pick<DatabaseService, 'db'>) {
  return {
    async withOrg<T>(orgId: string, fn: (transaction: OrganizationTransaction) => Promise<T>): Promise<T> {
      if (!isId('org', orgId)) throw new FasrunError(ErrorCodes.CONFIG_INVALID, 'Invalid organization identifier');
      return database.db.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('fasrun.org_id', ${orgId}, true)`);
        return fn(transaction);
      });
    },
  };
}
