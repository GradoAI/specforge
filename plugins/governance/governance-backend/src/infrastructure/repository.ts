import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { isId, newId } from '@fasrun/contracts-core';
import type { OutboxEvent } from '@fasrun/backend-plugin-api';
import {
  auditEventSchema,
  policySnapshotSchema,
  type AuditEvent,
  type PolicySnapshot,
} from '@fasrun/plugin-governance-common';
import { auditHash, canonicalJson, GENESIS_HASH } from '../common/audit-hash.js';
import type { GovernanceRepository, GovernanceSession } from '../common/ports.js';

/** The pool must use the non-owner app role. Every operation binds its tenant inside a transaction. */
export function createGovernanceRepository(pool: pg.Pool): GovernanceRepository {
  async function transaction<T>(
    orgId: string,
    actorId: string,
    work: (session: GovernanceSession) => Promise<T>,
  ): Promise<T> {
    return scoped(orgId, async (client) => work(session(client, orgId, actorId)));
  }
  async function scoped<T>(orgId: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (!isId('org', orgId)) throw new Error('Invalid organization');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [orgId]);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  function session(client: pg.PoolClient, orgId: string, actorId: string): GovernanceSession {
    const assertOrg = (value: string) => {
      if (value !== orgId) throw new Error('Organization mismatch');
    };
    return {
      async policy(context) {
        assertOrg(context.actor.orgId);
        const result = await client.query<{ snapshot: PolicySnapshot }>(
          'select snapshot from governance.policy_version order by created_at desc,id desc limit 1',
        );
        return result.rows[0]?.snapshot;
      },
      async publishPolicy(input) {
        const snapshot = policySnapshotSchema.parse(input);
        assertOrg(snapshot.orgId);
        await client.query(
          'insert into governance.policy_version(id,org_id,created_by,policy_version,snapshot) values($1,$2,$3,$4,$5)',
          [snapshot.id, orgId, actorId, snapshot.policyVersion, snapshot],
        );
        const budgets = snapshot.constraints.budgets;
        if (Array.isArray(budgets))
          for (const budget of budgets) {
            if (!budget || typeof budget !== 'object' || Array.isArray(budget)) throw new Error('Invalid budget');
            await client.query(
              'insert into governance.budget_constraint(id,org_id,created_by,policy_id,scope,scope_id,snapshot) values($1,$2,$3,$4,$5,$6,$7)',
              [newId('bdg'), orgId, actorId, snapshot.id, budget.scope, budget.scopeId, budget],
            );
          }
      },
      async appendAudit(input) {
        const event = auditEventSchema.parse(input);
        assertOrg(event.actor.orgId);
        // Transaction-scoped lock serializes all appenders for this tenant, including an empty chain.
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`governance.audit:${orgId}`]);
        const existing = await client.query<{
          event: AuditEvent;
          sequence: string;
          previous_hash: string;
          hash: string;
        }>('select event,sequence,previous_hash,hash from governance.audit_event where event_id=$1', [event.eventId]);
        const old = existing.rows[0];
        if (old) {
          if (canonicalJson(old.event) !== canonicalJson(event)) throw new Error('Audit event identity conflict');
          return { event: old.event, sequence: Number(old.sequence), previousHash: old.previous_hash, hash: old.hash };
        }
        const head = await client.query<{ sequence: string; hash: string }>(
          'select sequence,hash from governance.audit_event order by sequence desc limit 1',
        );
        const sequence = Number(head.rows[0]?.sequence ?? 0) + 1,
          previousHash = head.rows[0]?.hash ?? GENESIS_HASH,
          hash = auditHash(previousHash, event);
        await client.query(
          'insert into governance.audit_event(id,org_id,created_by,event_id,sequence,previous_hash,hash,event) values($1,$2,$3,$4,$5,$6,$7,$8)',
          [newId('aud'), orgId, actorId, event.eventId, sequence, previousHash, hash, event],
        );
        await client.query(
          'insert into governance.chain_checkpoint(id,org_id,created_by,sequence,hash) values($1,$2,$3,$4,$5)',
          [newId('chk'), orgId, actorId, sequence, hash],
        );
        return { event, sequence, previousHash, hash };
      },
      async auditRecords() {
        const result = await client.query<{ event: AuditEvent; sequence: string; previous_hash: string; hash: string }>(
          'select event,sequence,previous_hash,hash from governance.audit_event order by sequence',
        );
        return result.rows.map((r) => ({
          event: r.event,
          sequence: Number(r.sequence),
          previousHash: r.previous_hash,
          hash: r.hash,
        }));
      },
      async enqueue(event: OutboxEvent) {
        assertOrg(event.orgId);
        const inserted = await client.query(
          'insert into governance.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5) on conflict(org_id,event_id) do nothing returning id',
          [newId('evt'), orgId, actorId, event.eventId, event],
        );
        if (!inserted.rowCount) {
          const prior = await client.query<{ event: OutboxEvent }>(
            'select event from governance.outbox where event_id=$1',
            [event.eventId],
          );
          if (canonicalJson(prior.rows[0]?.event) !== canonicalJson(event))
            throw new Error('Outbox event identity conflict');
        }
      },
      async consume(eventId, work) {
        const inserted = await client.query(
          'insert into governance.consumer_receipt(id,org_id,created_by,event_id) values($1,$2,$3,$4) on conflict(org_id,event_id) do nothing returning id',
          [newId('rcp'), orgId, actorId, eventId],
        );
        if (!inserted.rowCount) return false;
        await work();
        return true;
      },
    };
  }
  return {
    transaction,
    outbox(orgId) {
      return {
        ownerPlugin: 'governance',
        async claim({ workerId, limit, leaseUntil }) {
          if (
            !workerId ||
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 1000 ||
            !Number.isFinite(Date.parse(leaseUntil))
          )
            throw new Error('Invalid lease request');
          return scoped(orgId, async (client) => {
            const token = randomUUID();
            const result = await client.query<{ event: OutboxEvent; lease_token: string }>(
              `with candidates as (select id from governance.outbox where state <> 'delivered' and retry_at <= clock_timestamp() and (lease_until is null or lease_until <= clock_timestamp()) order by created_at,id for update skip locked limit $1) update governance.outbox o set state='leased',lease_token=$2,lease_until=$3,attempts=attempts+1,updated_at=clock_timestamp(),version=version+1 from candidates c where o.id=c.id returning o.event,o.lease_token`,
              [limit, token, leaseUntil],
            );
            return result.rows.map((row) => ({ event: row.event, leaseToken: row.lease_token }));
          });
        },
        async ack({ eventId, leaseToken }) {
          await scoped(orgId, async (client) => {
            const result = await client.query(
              "update governance.outbox set state='delivered',lease_token=null,lease_until=null,updated_at=clock_timestamp(),version=version+1 where event_id=$1 and lease_token=$2 and lease_until > clock_timestamp() and state='leased'",
              [eventId, leaseToken],
            );
            if (!result.rowCount) throw new Error('Outbox lease lost');
          });
        },
        async retry({ eventId, leaseToken, retryAt }) {
          if (!Number.isFinite(Date.parse(retryAt))) throw new Error('Invalid retry time');
          await scoped(orgId, async (client) => {
            const result = await client.query(
              "update governance.outbox set state='pending',lease_token=null,lease_until=null,retry_at=$3,updated_at=clock_timestamp(),version=version+1 where event_id=$1 and lease_token=$2 and lease_until > clock_timestamp() and state='leased'",
              [eventId, leaseToken, retryAt],
            );
            if (!result.rowCount) throw new Error('Outbox lease lost');
          });
        },
      };
    },
  };
}
