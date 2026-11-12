import type { GovernanceService } from '@fasrun/plugin-governance-node';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { operationContextSchema, newId, type OperationContext, type DataLabels } from '@fasrun/contracts-core';
import { fasfileSchema, fasrunConfigSchema } from '@fasrun/plugin-spec-common';
import {
  pinnedProjectSchema,
  projectSourceSchema,
  type ProjectContext,
  projectContextSchema,
  tightenProjectConstraints,
  type PinnedProject,
} from '@fasrun/plugin-knowledge-common';
import type { KnowledgeService, ProjectMembersPort } from '@fasrun/plugin-knowledge-node';
import type { EnvironmentService } from '@fasrun/plugin-environment-node';
import type { ProjectRepository, RepositoryFilesPort } from '../common/ports.js';

export interface ProjectContextDependencies {
  repository: ProjectRepository;
  audit: Pick<GovernanceService, 'audit'>;
  clock?: () => string;
  files: RepositoryFilesPort;
  members: ProjectMembersPort;
  environment: EnvironmentService;
  /** Current authorization, including repository/project association and explicit revocation. */
  authorize(context: OperationContext, repositoryId: string): Promise<boolean>;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
class ProjectContextError extends Error {}

export function createProjectContextService(deps: ProjectContextDependencies): KnowledgeService {
  async function members(context: OperationContext, project: PinnedProject): Promise<void> {
    const ids = [...new Set(project.effectiveRules.prior_confirmations.flatMap((rule) => rule.reviewer_member_ids))];
    if (!ids.length) return;
    const resolved = await deps.members.resolveMembers(context, ids);
    if (
      resolved.length !== ids.length ||
      new Set(resolved.map((member) => member.id)).size !== ids.length ||
      resolved.some((member) => !member.active || member.orgId !== context.actor.orgId || !ids.includes(member.id))
    )
      throw new ProjectContextError('Unknown, inactive or cross-organization confirmation member');
  }
  async function readProject(
    context: OperationContext,
    request: { repositoryId: string; baseCommit: string; pin?: ProjectContext },
  ): Promise<PinnedProject> {
    operationContextSchema.parse(context);
    if (!request.repositoryId || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(request.baseCommit))
      throw new ProjectContextError('An immutable repository commit is required');
    async function audit(outcome: 'allowed' | 'denied'): Promise<void> {
      await deps.audit.audit({
        version: 1,
        eventId: newId('evt'),
        actor: context.actor,
        action: 'knowledge.project_context.read',
        objectType: 'repository',
        objectId: request.repositoryId,
        occurredAt: deps.clock?.() ?? new Date().toISOString(),
        outcome,
        details: { baseCommit: request.baseCommit },
      });
    }
    async function authorize(): Promise<void> {
      if (!(await deps.authorize(context, request.repositoryId))) {
        await audit('denied');
        throw new ProjectContextError('Project context access denied');
      }
    }
    await authorize();
    await audit('allowed');
    let source = await deps.repository.cached(context, request.repositoryId, request.baseCommit);
    if (!source) {
      const fetched = await deps.files.read(context, request);
      if (
        fetched.repositoryId !== request.repositoryId ||
        fetched.baseCommit !== request.baseCommit ||
        fetched.projectId !== context.scope.projectId
      )
        throw new ProjectContextError('Repository source identity mismatch');
      source = await deps.repository.cache(
        context,
        projectSourceSchema.parse({
          orgId: context.actor.orgId,
          projectId: fetched.projectId,
          repositoryId: fetched.repositoryId,
          baseCommit: fetched.baseCommit,
          config: fasrunConfigSchema.parse(parse(fetched.fasrunYaml)),
          ...(fetched.fasfile === undefined ? {} : { sourceRules: fasfileSchema.parse(parse(fetched.fasfile)) }),
        }),
      );
    }
    source = projectSourceSchema.parse(source);
    if (
      source.orgId !== context.actor.orgId ||
      source.projectId !== context.scope.projectId ||
      source.repositoryId !== request.repositoryId ||
      source.baseCommit !== request.baseCommit
    )
      throw new ProjectContextError('Cached project identity mismatch');
    const { config, sourceRules: rules } = source;
    const pin = request.pin === undefined ? undefined : projectContextSchema.parse(request.pin);
    if (
      pin &&
      (pin.orgId !== source.orgId ||
        pin.projectId !== source.projectId ||
        pin.repositoryId !== source.repositoryId ||
        pin.baseCommit !== source.baseCommit)
    )
      throw new ProjectContextError('Project pin identity mismatch');
    const catalog = await deps.repository.catalog(context, config.spec_template, pin);
    const environment = await deps.environment.snapshot(context, catalog.environment);
    if (
      environment.orgId !== context.actor.orgId ||
      environment.templateId !== catalog.environment.templateId ||
      environment.templateVersion !== catalog.environment.templateVersion
    )
      throw new ProjectContextError('Environment snapshot identity mismatch');
    const effectiveRules = tightenProjectConstraints(
      catalog.organizationRule.constraints,
      rules,
      environment.allowedCapabilities,
    );
    const labels: DataLabels = {
      trust: 'trusted',
      source: { kind: 'trusted_source', id: `${request.repositoryId}@${request.baseCommit}` },
      readScopes: [{ orgId: context.actor.orgId, projectId: source.projectId }],
      classification: 'project-configuration',
      excludedChannels: [],
    };
    const body = {
      config,
      ...(rules ? { sourceRules: rules } : {}),
      effectiveRules,
      ...catalog,
      environment: {
        templateId: environment.templateId,
        templateVersion: environment.templateVersion,
        allowedCapabilities: environment.allowedCapabilities,
      },
    };
    const versionHash = createHash('sha256').update(canonical({ body, labels })).digest('hex');
    const project = pinnedProjectSchema.parse({
      ...body,
      context: {
        version: 1,
        orgId: context.actor.orgId,
        projectId: source.projectId,
        repositoryId: request.repositoryId,
        baseCommit: request.baseCommit,
        configRef: {
          version: 1,
          id: `ref://knowledge/config/${versionHash}@${versionHash}`,
          orgId: context.actor.orgId,
          ownerPlugin: 'knowledge',
          versionHash,
          labels,
        },
        workflowVersion: catalog.workflows
          .map((workflow) => `${workflow.id}@${workflow.definitionVersion}`)
          .sort()
          .join(','),
        templateVersion: `${catalog.template.id}@${catalog.template.definitionVersion}`,
        policyVersion: `${catalog.organizationRule.id}@${catalog.organizationRule.definitionVersion}`,
      },
    });
    await members(context, project);
    if (pin && canonical(project.context) !== canonical(pin))
      throw new ProjectContextError('Project context does not match the immutable capture');
    await authorize();
    return project;
  }
  const service: KnowledgeService = {
    readProject,
    loadProjectContext: async (context, request) => (await readProject(context, request)).context,
    async selectWorkflow(context, request) {
      const reference = projectContextSchema.parse(request.project);
      const project = await readProject(context, { ...reference, pin: reference });
      if (canonical(project.context) !== canonical(reference))
        throw new ProjectContextError('Project context does not match the immutable capture');
      const selected = project.workflows.filter((workflow) => workflow.classification === request.classification);
      if (selected.length !== 1) throw new ProjectContextError('Workflow classification is not uniquely configured');
      return {
        workflowVersion: `${selected[0]!.id}@${selected[0]!.definitionVersion}`,
        templateVersion: `${project.template.id}@${project.template.definitionVersion}`,
      };
    },
  };
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProjectContextError) throw error;
      // eslint-disable-next-line preserve-caught-error -- Adapter causes may contain credentials; do not expose them.
      throw new Error('Project context invalid or unavailable');
    }
  }
  return {
    readProject: (context, request) => safe(() => service.readProject(context, request)),
    loadProjectContext: (context, request) => safe(() => service.loadProjectContext(context, request)),
    selectWorkflow: (context, request) => safe(() => service.selectWorkflow(context, request)),
  };
}
