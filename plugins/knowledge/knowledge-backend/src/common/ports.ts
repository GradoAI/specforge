import type { OperationContext } from '@fasrun/contracts-core';
import type {
  OrganizationRule,
  ProjectSource,
  ProjectContext,
  SpecificationTemplate,
  WorkflowDefinition,
} from '@fasrun/plugin-knowledge-common';

export interface ProjectCatalog {
  organizationRule: OrganizationRule;
  workflows: WorkflowDefinition[];
  template: SpecificationTemplate;
  environment: { templateId: string; templateVersion: string };
}
export interface ProjectRepository {
  cached(context: OperationContext, repositoryId: string, baseCommit: string): Promise<ProjectSource | undefined>;
  /** The first committed capture wins; a concurrent capture returns the immutable stored snapshot. */
  cache(context: OperationContext, project: ProjectSource): Promise<ProjectSource>;
  catalog(context: OperationContext, template?: string, pin?: ProjectContext): Promise<ProjectCatalog>;
}
/** Repository binding is authorized independently of caller-provided project IDs. The adapter must read this exact commit. */
export interface RepositoryFilesPort {
  read(
    context: OperationContext,
    request: { repositoryId: string; baseCommit: string },
  ): Promise<{
    repositoryId: string;
    baseCommit: string;
    projectId: string;
    fasrunYaml: string;
    fasfile?: string;
  }>;
}
