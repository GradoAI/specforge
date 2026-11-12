import { createServiceRef } from '@fasrun/backend-plugin-api';
import type { OperationContext } from '@fasrun/contracts-core';
import type { ProjectContext, PinnedProject } from '@fasrun/plugin-knowledge-common';

/** Bound by the host to identity's current-organization member read, never a caller-supplied roster. */
export interface ProjectMembersPort {
  resolveMembers(
    context: OperationContext,
    ids: readonly string[],
  ): Promise<readonly { id: string; orgId: string; active: boolean }[]>;
}
export interface KnowledgeService {
  readProject(
    context: OperationContext,
    request: { repositoryId: string; baseCommit: string; pin?: ProjectContext },
  ): Promise<PinnedProject>;
  loadProjectContext(
    context: OperationContext,
    request: { repositoryId: string; baseCommit: string },
  ): Promise<ProjectContext>;
  selectWorkflow(
    context: OperationContext,
    request: { project: ProjectContext; classification: 'small_defect' | 'standard_defect' | 'feature' },
  ): Promise<{ workflowVersion: string; templateVersion: string }>;
}

/** Owner-bound root facade; its factory binds knowledge's repository, never the caller's schema. */
export const knowledgeServiceRef = createServiceRef<KnowledgeService>({ id: 'knowledge.service', scope: 'root' });
