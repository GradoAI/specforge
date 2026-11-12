import type pg from 'pg';
import { isId, newId, type OperationContext } from '@fasrun/contracts-core';
import {
  projectSourceSchema,
  organizationRuleSchema,
  specificationTemplateSchema,
  validateSpecificationTemplate,
  workflowDefinitionSchema,
  type ProjectSource,
} from '@fasrun/plugin-knowledge-common';
import type { ProjectRepository } from '../common/ports.js';

export function createProjectRepository(pool: pg.Pool): ProjectRepository {
  async function scoped<T>(context: OperationContext, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (!isId('org', context.actor.orgId)) throw new Error('Invalid organization');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [context.actor.orgId]);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  async function cached(
    client: pg.PoolClient,
    repositoryId: string,
    baseCommit: string,
  ): Promise<ProjectSource | undefined> {
    const result = await client.query<{ snapshot: unknown }>(
      'select snapshot from knowledge.project_config_cache where repository_id=$1 and base_commit=$2',
      [repositoryId, baseCommit],
    );
    return result.rows[0] ? projectSourceSchema.parse(result.rows[0].snapshot) : undefined;
  }
  type DefinitionRow = { snapshot: unknown; definition_key: string; definition_version: string };
  function checked(row: DefinitionRow): unknown {
    if (
      !row.snapshot ||
      typeof row.snapshot !== 'object' ||
      !('id' in row.snapshot) ||
      !('definitionVersion' in row.snapshot) ||
      row.snapshot.id !== row.definition_key ||
      row.snapshot.definitionVersion !== row.definition_version
    )
      throw new Error('Catalog identity mismatch');
    return row.snapshot;
  }
  return {
    cached: (context, repositoryId, baseCommit) =>
      scoped(context, (client) => cached(client, repositoryId, baseCommit)),
    cache(context, input) {
      const project = projectSourceSchema.parse(input);
      if (project.orgId !== context.actor.orgId || project.projectId !== context.scope.projectId)
        return Promise.reject(new Error('Project organization/scope mismatch'));
      return scoped(context, async (client) => {
        await client.query(
          'insert into knowledge.project_config_cache(id,org_id,created_by,repository_id,base_commit,snapshot) values($1,$2,$3,$4,$5,$6) on conflict(org_id,repository_id,base_commit) do nothing',
          [newId('cfg'), context.actor.orgId, context.actor.actorId, project.repositoryId, project.baseCommit, project],
        );
        return (await cached(client, project.repositoryId, project.baseCommit))!;
      });
    },
    catalog(context, template, pin) {
      return scoped(context, async (client) => {
        function reference(value: string): { id: string; version: string } {
          const parts = /^(?<id>[^@,]+)@(?<version>[^@,]+)$/.exec(value)?.groups;
          if (!parts) throw new Error('An explicit catalog id@version is required');
          return { id: parts.id!, version: parts.version! };
        }
        async function definition(
          table: 'organization_rule' | 'workflow_definition' | 'spec_template',
          selection?: string,
        ) {
          const ref = selection === undefined ? undefined : reference(selection);
          const rows = ref
            ? await client.query<DefinitionRow>(
                `select snapshot,definition_key,definition_version from knowledge.${table} where definition_key=$1 and definition_version=$2`,
                [ref.id, ref.version],
              )
            : await client.query<DefinitionRow>(
                `select snapshot,definition_key,definition_version from knowledge.${table} order by created_at desc,id desc limit 1`,
              );
          if (!rows.rows[0]) throw new Error('Pinned catalog definition not found');
          return checked(rows.rows[0]);
        }
        const organizationRule = organizationRuleSchema.parse(
          await definition('organization_rule', pin?.policyVersion),
        );
        const selected = validateSpecificationTemplate(
          specificationTemplateSchema.parse(
            await definition('spec_template', pin?.templateVersion ?? template ?? 'default@1'),
          ),
        );
        const workflowValues: unknown[] = [];
        if (pin) {
          for (const ref of pin.workflowVersion.split(','))
            workflowValues.push(await definition('workflow_definition', ref));
        } else {
          const rows = await client.query<DefinitionRow>(
            'select distinct on (definition_key) snapshot,definition_key,definition_version from knowledge.workflow_definition order by definition_key,created_at desc,id desc',
          );
          workflowValues.push(...rows.rows.map(checked));
        }
        const workflows = workflowValues.map((value) => workflowDefinitionSchema.parse(value));
        if (workflows.length !== 3 || new Set(workflows.map((workflow) => workflow.classification)).size !== 3)
          throw new Error('Incomplete or ambiguous workflow catalog');
        return { organizationRule, template: selected, workflows, environment: organizationRule.environment };
      });
    },
  };
}
