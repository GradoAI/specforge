import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { isId, newId, type Scope } from '@fasrun/contracts-core';
import {
  authorizationSchema,
  permissionRuleSchema,
  type Authorization,
  type Member,
  type RoleAssignment,
  type PermissionRule,
} from '@fasrun/plugin-identity-common';
import type { OutboxEvent, OutboxPort } from '@fasrun/backend-plugin-api';
import type {
  IdentityRepository,
  IdentityTransaction,
  SessionRecord,
  LoginChallenge,
  ExternalAccount,
  AssociationIssue,
} from '../common/ports.js';
const stable = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());
export function createIdentityRepository(pool: pg.Pool): IdentityRepository {
  async function transaction<T>(
    orgId: string,
    actorId: string,
    work: (session: IdentityTransaction) => Promise<T>,
  ): Promise<T> {
    return scoped(orgId, (c) => work(session(c, orgId, actorId)));
  }
  async function scoped<T>(orgId: string, work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    if (!isId('org', orgId)) throw new Error('Invalid organization');
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('fasrun.org_id',$1,true)", [orgId]);
      await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`identity:${orgId}`]);
      const result = await work(c);
      await c.query('commit');
      return result;
    } catch (error) {
      await c.query('rollback');
      throw error;
    } finally {
      c.release();
    }
  }
  function session(c: pg.PoolClient, orgId: string, actorId: string): IdentityTransaction {
    const assertOrg = (id: string) => {
      if (id !== orgId) throw new Error('Organization mismatch');
    };
    async function json<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await c.query<{ value: T }>(sql, params);
      return result.rows.map((row) => row.value);
    }
    async function enqueue(event: OutboxEvent) {
      assertOrg(event.orgId);
      await c.query(
        'insert into identity.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5) on conflict(org_id,event_id) do nothing',
        [newId('evt'), orgId, actorId, event.eventId, event],
      );
    }
    return {
      async member(id) {
        return (
          await json<Member>(
            "select profile || jsonb_build_object('active',active,'sessionVersion',session_version) as value from identity.member where id=$1",
            [id],
          )
        )[0];
      },
      bySubject: (issuer, subject) =>
        json<Member>(
          "select profile || jsonb_build_object('active',active,'sessionVersion',session_version) as value from identity.member where issuer=$1 and subject=$2",
          [issuer, subject],
        ),
      async putMember(member) {
        assertOrg(member.orgId);
        const previous = await c.query<{ issuer: string; subject: string }>(
          'select issuer,subject from identity.member where id=$1',
          [member.id],
        );
        if (
          previous.rows[0] &&
          (previous.rows[0].issuer !== member.issuer || previous.rows[0].subject !== member.subject)
        )
          throw new Error('Member issuer and subject are immutable');
        await c.query(
          'insert into identity.member(id,org_id,created_by,issuer,subject,active,session_version,profile) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set active=excluded.active,session_version=excluded.session_version,profile=excluded.profile,updated_at=now(),version=identity.member.version+1',
          [member.id, orgId, actorId, member.issuer, member.subject, member.active, member.sessionVersion, member],
        );
      },
      async role(id) {
        return (
          await json<RoleAssignment>(
            "select jsonb_build_object('id',id,'memberId',member_id,'role',role,'scope',scope) as value from identity.role_assignment where id=$1",
            [id],
          )
        )[0];
      },
      roles: (memberId) =>
        json<RoleAssignment>(
          "select jsonb_build_object('id',id,'memberId',member_id,'role',role,'scope',scope) as value from identity.role_assignment where member_id=$1",
          [memberId],
        ),
      async setRole(role) {
        assertOrg(role.scope.orgId);
        const existing = await c.query<{ member_id: string }>(
          'select member_id from identity.role_assignment where id=$1',
          [role.id],
        );
        if (existing.rows[0] && existing.rows[0].member_id !== role.memberId)
          throw new Error('Role assignment member is immutable');
        await c.query(
          'insert into identity.role_assignment(id,org_id,created_by,member_id,role,scope) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set role=excluded.role,scope=excluded.scope,updated_at=now(),version=identity.role_assignment.version+1',
          [role.id, orgId, actorId, role.memberId, role.role, role.scope],
        );
      },
      async removeRole(id) {
        await c.query('delete from identity.role_assignment where id=$1', [id]);
      },
      rules: () => json<PermissionRule>('select definition as value from identity.permission_rule'),
      async putRule(input) {
        const rule = permissionRuleSchema.parse(input);
        assertOrg(rule.scope.orgId);
        await c.query(
          'insert into identity.permission_rule(id,org_id,created_by,rule_key,definition,is_customized) values($1,$2,$3,$4,$5,true) on conflict(org_id,rule_key) do update set definition=excluded.definition,is_customized=true,updated_at=now(),version=identity.permission_rule.version+1',
          [newId('rul'), orgId, actorId, rule.id, rule],
        );
      },
      projectScopes: (memberId) =>
        json<Scope>('select scope as value from identity.project_scope where member_id=$1', [memberId]),
      async putProjectScope(memberId, scope) {
        assertOrg(scope.orgId);
        await c.query(
          'insert into identity.project_scope(id,org_id,created_by,member_id,scope) values($1,$2,$3,$4,$5)',
          [newId('prj'), orgId, actorId, memberId, scope],
        );
      },
      external: (provider, issuer, subject) =>
        json<ExternalAccount>(
          "select jsonb_build_object('provider',provider,'issuer',issuer,'subject',subject,'memberId',member_id) as value from identity.external_account where provider=$1 and issuer=$2 and subject=$3",
          [provider, issuer, subject],
        ),
      async link(account) {
        await c.query(
          'insert into identity.external_account(id,org_id,created_by,provider,issuer,subject,member_id) values($1,$2,$3,$4,$5,$6,$7)',
          [newId('ext'), orgId, actorId, account.provider, account.issuer, account.subject, account.memberId],
        );
      },
      async associationIssue(input) {
        const values = await c.query<{ id: string; state: 'pending' | 'resolved' }>(
          'insert into identity.association_issue(id,org_id,created_by,provider,issuer,subject,event_id) values($1,$2,$3,$4,$5,$6,$7) on conflict(org_id,event_id) do update set updated_at=now() returning id,state',
          [newId('iss'), orgId, actorId, input.provider, input.issuer, input.subject, input.eventId],
        );
        return { ...input, ...values.rows[0]! };
      },
      issues: () =>
        json<AssociationIssue>(
          "select jsonb_build_object('id',id,'provider',provider,'issuer',issuer,'subject',subject,'eventId',event_id,'state',state) as value from identity.association_issue",
        ),
      async resolveIssue(id) {
        await c.query(
          "update identity.association_issue set state='resolved',updated_at=now(),version=version+1 where id=$1",
          [id],
        );
      },
      async authorization(id) {
        return (
          await json<{ snapshot: Authorization; permissions: string[]; revoked: boolean }>(
            "select jsonb_build_object('snapshot',snapshot,'permissions',permissions,'revoked',exists(select 1 from identity.authorization_revocation v where v.authorization_id=a.id)) as value from identity.authorization_record a where a.id=$1",
            [id],
          )
        )[0];
      },
      async byIntake(intakeId) {
        return (
          await json<Authorization>('select snapshot as value from identity.authorization_record where intake_id=$1', [
            intakeId,
          ])
        )[0];
      },
      async issue(input, permissions) {
        const snapshot = authorizationSchema.parse(input);
        assertOrg(snapshot.actor.orgId);
        assertOrg(snapshot.scope.orgId);
        const previous = (
          await json<Authorization>('select snapshot as value from identity.authorization_record where intake_id=$1', [
            snapshot.intakeId,
          ])
        )[0];
        if (previous) {
          if (
            previous.actor.actorId !== snapshot.actor.actorId ||
            previous.actor.actorKind !== snapshot.actor.actorKind ||
            previous.actor.orgId !== snapshot.actor.orgId ||
            stable(previous.scope) !== stable(snapshot.scope) ||
            previous.requestStrength !== snapshot.requestStrength
          )
            throw new Error('Intake identity conflict');
          return previous;
        }
        await c.query(
          'insert into identity.authorization_record(id,org_id,created_by,intake_id,snapshot,permissions) values($1,$2,$3,$4,$5,$6)',
          [snapshot.id, orgId, actorId, snapshot.intakeId, snapshot, JSON.stringify(permissions)],
        );
        return snapshot;
      },
      async revoke(id, reason, key) {
        const previous = await c.query<{ authorization_id: string; reason: string }>(
          'select authorization_id,reason from identity.authorization_revocation where idempotency_key=$1',
          [key],
        );
        if (previous.rows[0] && (previous.rows[0].authorization_id !== id || previous.rows[0].reason !== reason))
          throw new Error('Revocation idempotency conflict');
        await c.query(
          'insert into identity.authorization_revocation(id,org_id,created_by,authorization_id,reason,idempotency_key) values($1,$2,$3,$4,$5,$6) on conflict(org_id,idempotency_key) do nothing',
          [newId('rev'), orgId, actorId, id, reason, key],
        );
      },
      async session(digest) {
        return (
          await json<SessionRecord>(
            "select jsonb_build_object('digest',digest,'memberId',member_id,'sessionVersion',session_version,'csrfDigest',csrf_digest,'expiresAt',expires_at,'revoked',revoked) as value from identity.session where digest=$1",
            [digest],
          )
        )[0];
      },
      async saveSession(input) {
        await c.query(
          'insert into identity.session(id,org_id,created_by,digest,member_id,session_version,csrf_digest,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            newId('ses'),
            orgId,
            actorId,
            input.digest,
            input.memberId,
            input.sessionVersion,
            input.csrfDigest,
            input.expiresAt,
          ],
        );
      },
      async revokeSession(digest) {
        await c.query('update identity.session set revoked=true,updated_at=now(),version=version+1 where digest=$1', [
          digest,
        ]);
      },
      async saveChallenge(input) {
        await c.query(
          'insert into identity.login_challenge(id,org_id,created_by,state_digest,browser_digest,verifier,nonce,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            newId('log'),
            orgId,
            actorId,
            input.stateDigest,
            input.browserDigest,
            input.verifier,
            input.nonce,
            input.expiresAt,
          ],
        );
      },
      async takeChallenge(state, browser, now) {
        return (
          await json<LoginChallenge>(
            "delete from identity.login_challenge where state_digest=$1 and browser_digest=$2 and expires_at>$3 returning jsonb_build_object('stateDigest',state_digest,'browserDigest',browser_digest,'verifier',verifier,'nonce',nonce,'expiresAt',expires_at) as value",
            [state, browser, now],
          )
        )[0];
      },
      async candidate(intakeId, facts) {
        await c.query(
          'insert into identity.candidate(id,org_id,created_by,intake_id,evidence) values($1,$2,$3,$4,$5) on conflict(org_id,intake_id) do nothing',
          [newId('can'), orgId, actorId, intakeId, facts],
        );
      },
      enqueue,
    };
  }
  function outbox(orgId: string): OutboxPort {
    return {
      ownerPlugin: 'identity',
      claim: (request) =>
        scoped(orgId, async (c) => {
          const result = await c.query<{ event: OutboxEvent; lease_token: string }>(
            "with selected as(select id from identity.outbox where (state='pending' or(state='leased' and lease_until<=now())) and retry_at<=now() order by created_at,id for update skip locked limit $1) update identity.outbox o set state='leased',lease_token=$2,lease_until=$3,attempts=attempts+1,updated_at=now(),version=version+1 from selected where o.id=selected.id returning o.event,o.lease_token",
            [request.limit, randomUUID(), request.leaseUntil],
          );
          return result.rows.map((r) => ({ event: r.event, leaseToken: r.lease_token }));
        }),
      ack: (request) =>
        scoped(orgId, async (c) => {
          await c.query(
            "update identity.outbox set state='delivered',lease_token=null,lease_until=null,updated_at=now(),version=version+1 where event_id=$1 and lease_token=$2 and state='leased'",
            [request.eventId, request.leaseToken],
          );
        }),
      retry: (request) =>
        scoped(orgId, async (c) => {
          await c.query(
            "update identity.outbox set state='pending',lease_token=null,lease_until=null,retry_at=$3,updated_at=now(),version=version+1 where event_id=$1 and lease_token=$2 and state='leased'",
            [request.eventId, request.leaseToken, request.retryAt],
          );
        }),
    };
  }
  return { transaction, outbox };
}
