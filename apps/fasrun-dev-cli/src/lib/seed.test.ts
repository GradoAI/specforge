import pg from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { seedConnection, seedOrganizations } from './seed.js';

afterEach(() => vi.restoreAllMocks());

it('TC-PLATFORM-035 production is refused before constructing any database pool', async () => {
  const pool = vi.spyOn(pg, 'Pool');
  await expect(seedOrganizations({ environment: 'production', organizations: [] })).rejects.toThrow(
    'forbidden in production',
  );
  expect(pool).not.toHaveBeenCalled();
});

it('TC-PLATFORM-034 only the app role and supported environments can seed', () => {
  for (const environment of [undefined, 'development', 'test', 'staging']) {
    expect(seedConnection(environment, 'postgresql://fasrun_app:example@127.0.0.1/db')).toContain('fasrun_app');
  }
  for (const value of ['postgres://fasrun_owner@127.0.0.1/db', 'https://fasrun_app@127.0.0.1/db', 'invalid']) {
    expect(() => seedConnection('test', value)).toThrow('must use PostgreSQL and fasrun_app');
  }
  expect(() => seedConnection('prod', 'postgres://fasrun_app@127.0.0.1/db')).toThrow('Unknown FASRUN_ENVIRONMENT');
  expect(() => seedConnection('test', undefined)).toThrow('Missing required FASRUN_DATABASE_URL');
});
