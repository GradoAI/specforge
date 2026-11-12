import type pg from 'pg';
import { isId } from '@fasrun/contracts-core';
import { environmentSnapshotSchema } from '@fasrun/plugin-environment-common';
import type { EnvironmentDependencies } from '../application/snapshot.js';

export function createEnvironmentRepository(pool: pg.Pool): Pick<EnvironmentDependencies, 'load'> {
  return {
    async load(context, request) {
      if (!isId('org', context.actor.orgId)) throw new Error('Invalid organization');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('fasrun.org_id',$1,true)", [context.actor.orgId]);
        const result = await client.query<{ snapshot: unknown }>(
          'select snapshot from environment.template_version where definition_key=$1 and definition_version=$2',
          [request.templateId, request.templateVersion],
        );
        await client.query('commit');
        return result.rows[0] ? environmentSnapshotSchema.parse(result.rows[0].snapshot) : undefined;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
