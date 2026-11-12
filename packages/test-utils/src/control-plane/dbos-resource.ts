import { randomBytes } from 'node:crypto';
import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { createTestDatabase, type TestDatabase, type TestPostgres } from '../postgres.js';

let runtimeLease: symbol | undefined;

export interface DbosTestResource {
  /** Fresh database belonging only to this resource. URLs contain ephemeral test credentials; do not log them. */
  readonly database: TestDatabase;
  readonly runtimeRole: string;
  readonly runtimeUrl: string;
  /** Register workflows before start. Only one DBOS singleton can be active in a Vitest worker. */
  start(): Promise<void>;
  /** Stop this resource's runtime, retaining durable data and workflow registrations for restart. */
  stop(): Promise<void>;
  /** Stop and drop only this generated database and role. Repeated dispose is harmless. */
  dispose(): Promise<void>;
}

/** Real DBOS + PostgreSQL resources, never an in-memory runtime substitute.
 * Independent resources have distinct databases/roles. Run simultaneous runtimes in separate processes.
 */
export async function createDbosTestResource(postgres: TestPostgres): Promise<DbosTestResource> {
  if (process.env.DBOS__CLOUD === 'true') throw new Error('Test resources cannot run in DBOS Cloud mode');
  const database = await createTestDatabase(postgres);
  const runtimeRole = `test_dbos_${randomBytes(8).toString('hex')}`;
  const password = randomBytes(18).toString('base64url');
  const url = new URL(database.ownerUrl);
  url.username = runtimeRole;
  url.password = password;
  let roleCreated = false;
  const adminQuery = async (query: string) => {
    const admin = new pg.Client({ connectionString: postgres.adminUrl });
    await admin.connect();
    try {
      await admin.query(query);
    } finally {
      await admin.end();
    }
  };
  try {
    // Names/password are generated here from fixed alphabets, not caller-controlled SQL fragments.
    await adminQuery(`create role ${runtimeRole} login nosuperuser nobypassrls password '${password}'`);
    roleCreated = true;
    await adminQuery(`grant connect, create on database ${database.name} to ${runtimeRole}`);
  } catch (error) {
    await database.drop();
    if (roleCreated) await adminQuery(`drop role ${runtimeRole}`);
    throw error;
  }
  const lease = Symbol(database.name);
  let disposed = false;
  // Serialize calls on this resource; the process lease protects other resources before any launch awaits.
  let operation: Promise<void> = Promise.resolve();
  const serialize = (run: () => Promise<void>) => {
    const next = operation.then(run, run);
    operation = next;
    return next;
  };
  const stop = async () => {
    if (runtimeLease !== lease) return;
    await DBOS.shutdown();
    runtimeLease = undefined;
  };
  return {
    database,
    runtimeRole,
    runtimeUrl: url.toString(),
    start: () =>
      serialize(async () => {
        if (disposed) throw new Error('Test resource is disposed');
        if (runtimeLease === lease && DBOS.isInitialized()) return;
        if (runtimeLease !== undefined || DBOS.isInitialized())
          throw new Error('A DBOS runtime is already active in this worker; use a separate process');
        if (process.env.DBOS__CLOUD === 'true') throw new Error('Test resources cannot run in DBOS Cloud mode');
        runtimeLease = lease;
        try {
          DBOS.setConfig({
            name: database.name,
            applicationVersion: 'fasrun-test-resource@1',
            executorID: database.name,
            systemDatabaseUrl: url.toString(),
            systemDatabaseSchemaName: 'dbos',
            systemDatabasePoolSize: 4,
            enableOTLP: false,
            tracingEnabled: false,
            logLevel: 'error',
          });
          await DBOS.launch();
        } catch (error) {
          await stop();
          throw error;
        }
      }),
    stop: () => serialize(stop),
    dispose: () =>
      serialize(async () => {
        if (disposed) return;
        await stop();
        await database.drop();
        await adminQuery(`drop role if exists ${runtimeRole}`);
        disposed = true;
      }),
  };
}
