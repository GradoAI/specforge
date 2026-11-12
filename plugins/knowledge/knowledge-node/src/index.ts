import { createServiceRef } from '@fasrun/backend-plugin-api';
import type { OperationContext } from '@fasrun/contracts-core';
import type { ProjectContext } from '@fasrun/plugin-knowledge-common';

export interface KnowledgeService {
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
