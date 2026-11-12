// T011: real PostgreSQL, T009 roles, and committed migrations. This setup is not the T012 migration runner.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { organizationDatabase } from '@fasrun/backend-defaults';
import { newId } from '@fasrun/contracts-core';
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { organization } from './organization.js';

const orgA = newId('org');
const orgB = newId('org');
const migrations = fileURLToPath(new URL('../../../migrations/', import.meta.url));

describe('identity.organization (R-platform-007, D-7)', () => {
  let database: TestDatabase | undefined;
  let owner: pg.Pool;
  let app: pg.Pool;
  let db: NodePgDatabase;
  let scoped: ReturnType<typeof organizationDatabase>;
  beforeAll(async () => {
    database = await createTestDatabase(inject('fasrunPostgres'));
    owner = new pg.Pool({ connectionString: database.ownerUrl });
    // Only a test fixture: T012 will provide production migration orchestration and grants.
    const journal = JSON.parse(readFileSync(`${migrations}/meta/_journal.json`, 'utf8')) as {
      entries: { tag: string }[];
    };
    for (const { tag } of journal.entries) await owner.query(readFileSync(`${migrations}/${tag}.sql`, 'utf8'));
    await owner.query('grant usage on schema identity to fasrun_app');
    await owner.query('grant select, insert, update, delete on identity.organization to fasrun_app');
    await owner.query(
      "insert into identity.organization (id, org_id, name, slug, created_by) values ($1,$1,'A','a','test'),($2,$2,'B','b','test')",
      [orgA, orgB],
    );
    // A single connection proves reuse after both commit and rollback cannot carry an organization over.
    app = new pg.Pool({ connectionString: database.appUrl, max: 1 });
    db = drizzle(app);
    scoped = organizationDatabase({ db });
  });
  afterAll(async () => {
    await app?.end();
    await owner?.end();
    await database?.drop();
  });

  it('TC-PLATFORM-022 rejects a wrong id prefix specifically with ck_organization_id', async () => {
    const wrong = newId('wrk');
    // Owner bypasses RLS; org_id equals id and all other constraints are satisfied.
    await expect(
      owner.query(
        "insert into identity.organization (id,org_id,name,slug,created_by) values ($1,$1,'Valid','wrong-prefix','test')",
        [wrong],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'ck_organization_id' });
  });

  it('TC-PLATFORM-023 fasrun_app sees only the requested organization', async () => {
    for (const id of [orgA, orgB]) {
      const rows = await scoped.withOrg(id, (tx) => tx.select().from(organization));
      expect(rows.map((row) => row.id)).toEqual([id]);
    }
    const role = await app.query<{ current_user: string }>('select current_user');
    expect(role.rows[0]?.current_user).toBe('fasrun_app');
  });

  it('enables and forces RLS, uses non-owner NOBYPASSRLS app role, and documents every column', async () => {
    const { rows } = await owner.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      owner: string;
      comment: string;
    }>(
      "select relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) as owner, obj_description(oid) as comment from pg_class where oid='identity.organization'::regclass",
    );
    expect(rows[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, owner: 'fasrun_owner' });
    expect(rows[0]?.comment).toBeTruthy();
    const roles = await owner.query(
      "select rolname, rolbypassrls, rolsuper from pg_roles where rolname in ('fasrun_app','fasrun_owner') order by rolname",
    );
    expect(roles.rows).toEqual([
      { rolname: 'fasrun_app', rolbypassrls: false, rolsuper: false },
      { rolname: 'fasrun_owner', rolbypassrls: true, rolsuper: false },
    ]);
    const columns = await owner.query<{ comment: string }>(
      "select col_description(attrelid,attnum) as comment from pg_attribute where attrelid='identity.organization'::regclass and attnum>0 and not attisdropped",
    );
    expect(columns.rows).toHaveLength(9);
    for (const column of columns.rows) expect(column.comment).toBeTruthy();
  });

  it('allows own-organization writes and denies cross-organization reads, inserts and updates', async () => {
    await scoped.withOrg(orgA, async (tx) => {
      expect(await tx.select().from(organization).where(eq(organization.id, orgB))).toEqual([]);
      expect(
        await tx.update(organization).set({ name: 'Forbidden' }).where(eq(organization.id, orgB)).returning(),
      ).toEqual([]);
      expect(await tx.delete(organization).where(eq(organization.id, orgB)).returning()).toEqual([]);
      expect(
        await tx.update(organization).set({ name: 'Updated A' }).where(eq(organization.id, orgA)).returning(),
      ).toHaveLength(1);
    });
    const other = newId('org');
    await expect(
      scoped.withOrg(orgA, (tx) =>
        tx.insert(organization).values({ id: other, orgId: other, name: 'Other', slug: 'other', createdBy: 'test' }),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
      scoped.withOrg(orgA, (tx) =>
        tx.update(organization).set({ id: other, orgId: other }).where(eq(organization.id, orgA)),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await scoped.withOrg(other, async (tx) => {
      await tx.insert(organization).values({ id: other, orgId: other, name: 'Own', slug: 'own', createdBy: 'test' });
      expect(await tx.delete(organization).where(eq(organization.id, other)).returning()).toHaveLength(1);
    });
  });

  it('fails closed without an organization and clears context after commit and rollback on the same connection', async () => {
    const pid = (await app.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]?.pid;
    expect(await db.select().from(organization)).toEqual([]);
    for (const id of ['', 'invalid', newId('wrk')])
      await expect(scoped.withOrg(id, () => Promise.resolve('not reached'))).rejects.toThrow('organization');
    await scoped.withOrg(orgA, async (tx) => {
      const result = await tx.execute<{ pid: number; org: string }>(
        sql`select pg_backend_pid() as pid, current_setting('fasrun.org_id', true) as org`,
      );
      expect(result.rows[0]).toEqual({ pid, org: orgA });
    });
    expect(await db.select().from(organization)).toEqual([]);
    await expect(
      scoped.withOrg(orgB, async (tx) => {
        await tx.update(organization).set({ name: 'Rolled back' }).where(eq(organization.id, orgB));
        throw new Error('rollback probe');
      }),
    ).rejects.toThrow('rollback probe');
    expect(await db.select().from(organization)).toEqual([]);
    expect(
      (
        await app.query<{ pid: number; org: string }>(
          "select pg_backend_pid() as pid, current_setting('fasrun.org_id', true) as org",
        )
      ).rows[0],
    ).toEqual({ pid, org: '' });
    expect((await scoped.withOrg(orgB, (tx) => tx.select().from(organization)))[0]?.name).toBe('B');
    const id = newId('org');
    await expect(
      db.insert(organization).values({ id, orgId: id, name: 'No context', slug: 'no-context', createdBy: 'test' }),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('keeps concurrent organization transactions isolated', async () => {
    const pool = new pg.Pool({ connectionString: database?.appUrl, max: 2 });
    const concurrent = organizationDatabase({ db: drizzle(pool) });
    try {
      const results = await Promise.all(
        [orgA, orgB].map((id) =>
          concurrent.withOrg(id, async (tx) => {
            await tx.execute(sql`select pg_sleep(0.05)`);
            return (await tx.select().from(organization)).map((row) => row.id);
          }),
        ),
      );
      expect(results).toEqual([[orgA], [orgB]]);
    } finally {
      await pool.end();
    }
  });

  it('enforces self organization, name length and global slug uniqueness', async () => {
    const id = newId('org');
    for (const [orgId, name, slug, constraint, code] of [
      [orgA, 'Name', 'different', 'ck_organization_org_id_self', '23514'],
      [id, '', 'empty', 'ck_organization_name_length', '23514'],
      [id, 'x'.repeat(201), 'long', 'ck_organization_name_length', '23514'],
      [id, 'Name', 'a', 'uq_organization_slug', '23505'],
    ]) {
      await expect(
        owner.query("insert into identity.organization (id,org_id,name,slug,created_by) values ($1,$2,$3,$4,'test')", [
          id,
          orgId,
          name,
          slug,
        ]),
      ).rejects.toMatchObject({ constraint, code });
    }
  });
});
