import type pg from 'pg';
import { createAgentInvoker } from '../application/agents/invoker.js';
import type { AgentDependencies } from '../application/agents/ports.js';
import { createAgentRepository } from '../infrastructure/agents/repository.js';
/** T020 owns host wiring; absence of a configured implementation never selects a fixture. */
export function createAgentServices(options: Omit<AgentDependencies, 'repository'> & { pool: pg.Pool }) {
  return { invoker: createAgentInvoker({ ...options, repository: createAgentRepository(options.pool) }) };
}
