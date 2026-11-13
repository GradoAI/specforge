import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { isId, newId, jsonValueSchema } from '@fasrun/contracts-core';
import type { OutboxEvent } from '@fasrun/backend-plugin-api';
import { canonicalData, type DataObject } from '@fasrun/plugin-orchestration-common';
import type { DataRepository } from '../../application/data/ports.js';
export function createDataRepository(pool: pg.Pool): DataRepository {
  async function scoped<T>(orgId: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (!isId('org', orgId)) throw new Error('Invalid organization');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('fasrun.org_id',$1,true)", [orgId]);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch {
      await client.query('rollback');
      throw new Error('Data repository operation failed');
    } finally {
      client.release();
    }
  }
  return {
    find: (orgId, _actorId, uri) =>
      scoped(orgId, async (client) => {
        const parts = /^ref:\/\/orchestration\/([a-z][a-z0-9-]*)\/([A-Za-z0-9_-]+)@([a-f0-9]{64})$/.exec(uri);
        if (!parts) return undefined;
        const result = await client.query<{ object: DataObject }>(
          'select object from orchestration.data_object where org_id=$1 and category=$2 and object_id=$3 and version_hash=$4',
          [orgId, parts[1], parts[2], parts[3]],
        );
        return result.rows[0]?.object;
      }),
    insert: (context, object, audit) =>
      scoped(context.actor.orgId, async (client) => {
        if (context.actor.orgId !== object.ref.orgId || audit.actor.orgId !== object.ref.orgId)
          throw new Error('Organization mismatch');
        const inserted = await client.query(
          `insert into orchestration.data_object(id,org_id,created_by,object_id,category,version_hash,content_hash,byte_length,object)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(org_id,category,object_id,version_hash) do nothing returning id`,
          [
            newId('dat'),
            object.ref.orgId,
            context.actor.actorId,
            object.objectId,
            object.category,
            object.ref.versionHash,
            object.contentHash,
            object.byteLength,
            object,
          ],
        );
        if (!inserted.rowCount) {
          const prior = await client.query<{ object: DataObject }>(
            `select object from orchestration.data_object where org_id=$1 and category=$2 and object_id=$3 and version_hash=$4`,
            [object.ref.orgId, object.category, object.objectId, object.ref.versionHash],
          );
          if (canonicalData(prior.rows[0]?.object) !== canonicalData(object)) throw new Error('Data identity conflict');
          return;
        }
        const envelope: OutboxEvent = {
          version: 1,
          eventId: audit.eventId,
          orgId: object.ref.orgId,
          topic: 'governance.audit.requested',
          occurredAt: audit.occurredAt,
          payload: jsonValueSchema.parse(audit),
        };
        await client.query(
          'insert into orchestration.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5)',
          [newId('evt'), object.ref.orgId, context.actor.actorId, audit.eventId, envelope],
        );
      }),
    outbox(orgId) {
      return {
        ownerPlugin: 'orchestration',
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
              `with candidates as (select id from orchestration.outbox where state <> 'delivered' and retry_at <= clock_timestamp() and (lease_until is null or lease_until <= clock_timestamp()) order by created_at,id for update skip locked limit $1) update orchestration.outbox o set state='leased',lease_token=$2,lease_until=$3,attempts=attempts+1,updated_at=clock_timestamp(),version=version+1 from candidates c where o.id=c.id returning o.event,o.lease_token`,
              [limit, token, leaseUntil],
            );
            return result.rows.map((row) => ({ event: row.event, leaseToken: row.lease_token }));
          });
        },
        async ack({ eventId, leaseToken }) {
          await scoped(orgId, async (client) => {
            const result = await client.query(
              "update orchestration.outbox set state='delivered',lease_token=null,lease_until=null,updated_at=clock_timestamp(),version=version+1 where event_id=$1 and lease_token=$2 and lease_until > clock_timestamp() and state='leased'",
              [eventId, leaseToken],
            );
            if (!result.rowCount) throw new Error('Outbox lease lost');
          });
        },
        async retry({ eventId, leaseToken, retryAt }) {
          if (!Number.isFinite(Date.parse(retryAt))) throw new Error('Invalid retry time');
          await scoped(orgId, async (client) => {
            const result = await client.query(
              "update orchestration.outbox set state='pending',lease_token=null,lease_until=null,retry_at=$3,updated_at=clock_timestamp(),version=version+1 where event_id=$1 and lease_token=$2 and lease_until > clock_timestamp() and state='leased'",
              [eventId, leaseToken, retryAt],
            );
            if (!result.rowCount) throw new Error('Outbox lease lost');
          });
        },
      };
    },
  };
}
