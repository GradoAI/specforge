import type pg from 'pg';
import { createServiceFactory } from '@fasrun/backend-plugin-api';
import { knowledgeServiceRef } from '@fasrun/plugin-knowledge-node';
import { createProjectContextService, type ProjectContextDependencies } from '../application/project-context.js';
import { createProjectRepository } from '../infrastructure/repository.js';
export function createKnowledgeServices(options: Omit<ProjectContextDependencies, 'repository'> & { pool: pg.Pool }) {
  const service = createProjectContextService({ ...options, repository: createProjectRepository(options.pool) });
  return { service, factory: createServiceFactory({ service: knowledgeServiceRef, deps: {}, factory: () => service }) };
}
