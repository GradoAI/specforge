// PostgreSQL for integration tests (SF-1 D-14): one Testcontainers instance per test run, prepared as a template
// database; every test file clones its own database from the template, so files can run in parallel.
import { randomBytes } from 'node:crypto';
import pg from 'pg';

/** Connection details handed from the global setup to the test files through Vitest's provide/inject. */
export interface TestPostgres {
  /** Superuser URL of the container, used to create and drop databases. */
  adminUrl: string;
  /** Template database every test database is cloned from. */
  template: string;
  /** Login roles of SF-1 D-7: the schema owner (BYPASSRLS) and the application role (NOBYPASSRLS). */
  roles: { owner: { name: string; password: string }; app: { name: string; password: string } };
}

declare module 'vitest' {
  export interface ProvidedContext {
    fasrunPostgres: TestPostgres;
  }
}

export const OWNER_ROLE = 'fasrun_owner';
export const APP_ROLE = 'fasrun_app';
export const TEMPLATE_DATABASE = 'fasrun_template';

const withUrl = (base: string, database: string, user?: { name: string; password: string }) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user.name;
    url.password = user.password;
  }
  return url.toString();
};

/** Creates the roles and the template database; `prepareTemplate` runs against the template (e.g. migrations). */
export async function prepareTestPostgres(
  adminUrl: string,
  prepareTemplate?: (templateUrl: string) => Promise<void>,
): Promise<TestPostgres> {
  // Generated per run and never written anywhere but the throwaway container.
  const roles = {
    owner: { name: OWNER_ROLE, password: randomBytes(18).toString('base64url') },
    app: { name: APP_ROLE, password: randomBytes(18).toString('base64url') },
  };
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`create role ${OWNER_ROLE} login bypassrls password '${roles.owner.password}'`);
    await admin.query(`create role ${APP_ROLE} login nobypassrls password '${roles.app.password}'`);
    await admin.query(`create database ${TEMPLATE_DATABASE} owner ${OWNER_ROLE}`);
  } finally {
    await admin.end();
  }
  if (prepareTemplate) await prepareTemplate(withUrl(adminUrl, TEMPLATE_DATABASE, roles.owner));
  return { adminUrl, template: TEMPLATE_DATABASE, roles };
}

export interface TestDatabase {
  name: string;
  /** URL as the schema owner (fasrun_owner). */
  ownerUrl: string;
  /** URL as the application role (fasrun_app). */
  appUrl: string;
  drop(): Promise<void>;
}

/** Clones a fresh database from the template; call drop() when the test file is done. */
export async function createTestDatabase(postgres: TestPostgres): Promise<TestDatabase> {
  const name = `test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: postgres.adminUrl });
  await admin.connect();
  try {
    // Concurrent clones of one template can collide briefly (55006: source database is being accessed).
    for (let attempt = 0; ; attempt++) {
      try {
        await admin.query(`create database ${name} template ${postgres.template} owner ${OWNER_ROLE}`);
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== '55006' || attempt >= 20) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
      }
    }
    await admin.query(`grant connect on database ${name} to ${APP_ROLE}`);
  } finally {
    await admin.end();
  }
  return {
    name,
    ownerUrl: withUrl(postgres.adminUrl, name, postgres.roles.owner),
    appUrl: withUrl(postgres.adminUrl, name, postgres.roles.app),
    async drop() {
      const client = new pg.Client({ connectionString: postgres.adminUrl });
      await client.connect();
      try {
        await client.query(`drop database if exists ${name} with (force)`);
      } finally {
        await client.end();
      }
    },
  };
}
