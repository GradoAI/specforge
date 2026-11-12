import { organizationDatabase } from '@fasrun/backend-defaults';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { CliError, CliErrorCodes } from '../errors.js';

export interface SeedOrganization {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
}

/** Validate before opening a pool: production must never reach the database. */
export function seedConnection(environment: string | undefined, connectionString: string | undefined): string {
  const name = environment ?? 'development';
  if (name === 'production')
    throw new CliError(CliErrorCodes.CONFIG_INVALID, 'Example datasets are forbidden in production');
  if (!['development', 'test', 'staging'].includes(name))
    throw new CliError(CliErrorCodes.CONFIG_INVALID, 'Unknown FASRUN_ENVIRONMENT');
  if (!connectionString) throw new CliError(CliErrorCodes.USAGE, 'Missing required FASRUN_DATABASE_URL');
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || decodeURIComponent(url.username) !== 'fasrun_app')
      throw new Error();
  } catch {
    throw new CliError(CliErrorCodes.CONFIG_INVALID, 'FASRUN_DATABASE_URL must use PostgreSQL and fasrun_app');
  }
  return connectionString;
}

/** M0 only has identity.organization. Every organization is written in its own RLS context. */
export async function seedOrganizations(options: {
  environment?: string | undefined;
  connectionString?: string | undefined;
  organizations: readonly SeedOrganization[];
}): Promise<{ organizations: number }> {
  const connectionString = seedConnection(options.environment, options.connectionString);
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    const role = await pool.query<{ name: string; bypass: boolean; superuser: boolean }>(
      'select current_user as name, rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname = current_user',
    );
    if (role.rows[0]?.name !== 'fasrun_app' || role.rows[0].bypass || role.rows[0].superuser) {
      throw new CliError(
        CliErrorCodes.CONFIG_INVALID,
        'Seeding requires fasrun_app without BYPASSRLS or superuser privileges',
      );
    }
    const database = organizationDatabase({ db: drizzle(pool) });
    for (const organization of options.organizations) {
      await database.withOrg(organization.id, async (transaction) => {
        await transaction.execute(sql`
          insert into identity.organization as target (id, org_id, name, slug, created_by)
          values (${organization.id}, ${organization.id}, ${organization.name}, ${organization.slug}, ${organization.createdBy})
          on conflict (id) do update set name = excluded.name, slug = excluded.slug,
            updated_at = now(), version = target.version + 1
          where target.name is distinct from excluded.name or target.slug is distinct from excluded.slug
        `);
      });
    }
    return { organizations: options.organizations.length };
  } catch (error) {
    if (error instanceof CliError) throw error;
    const code = (error as { code?: string }).code;
    if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code ?? ''))
      throw new CliError(CliErrorCodes.UNREACHABLE, 'Cannot connect to the example dataset database');
    if (['28P01', '28000'].includes(code ?? ''))
      throw new CliError(CliErrorCodes.CONFIG_INVALID, 'Example dataset database authentication failed');
    throw new CliError(
      CliErrorCodes.INTERNAL,
      'Example dataset write failed; check migrations and database configuration',
    );
  } finally {
    await pool.end();
  }
}
