// Vitest global setup: starts one PostgreSQL container for the run and provides `fasrunPostgres` to test files.
// Use it from a Vitest config: `globalSetup: ['@fasrun/test-utils/global-setup']`. Under colima, set DOCKER_HOST to
// the colima socket and TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock.
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { prepareTestPostgres } from './postgres.js';

export const POSTGRES_IMAGE = 'postgres:18-alpine';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  project.provide('fasrunPostgres', await prepareTestPostgres(container.getConnectionUri()));
  return async () => {
    await container.stop();
  };
}
