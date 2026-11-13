import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { newId, isId, type OperationContext } from '@fasrun/contracts-core';
import {
  externalActionSchema,
  actionResultSchema,
  type ExternalAction,
  type ActionResult,
} from '@fasrun/plugin-connect-common';
import type { ActionRepository } from '../../application/actions/ports.js';
import type { ReconcilePosition } from '@fasrun/plugin-connect-node';
interface ActionRow {
  result: unknown;
  leased: boolean | null;
  delayed: boolean | null;
  lease_token: string | null;
}
interface Stored {
  action: ExternalAction;
  result: ActionResult;
}
export function createActionRepository(pool: pg.Pool, leaseMs = 30000): ActionRepository {
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300000) throw new Error('Invalid action lease');
  async function tx<T>(context: OperationContext, work: (c: pg.PoolClient) => Promise<T>) {
    if (!isId('org', context.actor.orgId)) throw new Error('Invalid tenant');
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('fasrun.org_id',$1,true)", [context.actor.orgId]);
      const r = await work(c);
      await c.query('commit');
      return r;
    } catch {
      try {
        await c.query('rollback');
      } catch {
        /* No raw database failure may escape. */
      }
      throw new Error('Action persistence unavailable');
    } finally {
      c.release();
    }
  }
  async function scope(c: pg.PoolClient, integrationId: string, repositoryId: string) {
    const r = await c.query<{ org_id: string; team_id: string; project_id: string }>(
      'select b.org_id,b.team_id,b.project_id from connect.repository_binding b join connect.integration i on i.id=b.integration_id and i.org_id=b.org_id where i.id=$1 and b.repository_id=$2 and i.active and b.active for share of i,b',
      [integrationId, repositoryId],
    );
    const row = r.rows[0];
    if (!row) throw new Error('Unbound repository');
    return { orgId: row.org_id, teamId: row.team_id, projectId: row.project_id };
  }
  async function row(c: pg.PoolClient, id: string) {
    const r = await c.query<ActionRow>(
      'select *,lease_until>clock_timestamp() as leased,retry_at>clock_timestamp() as delayed from connect.outbound_action where id=$1 for update',
      [id],
    );
    if (!r.rows[0]) throw new Error('Missing action');
    return r.rows[0];
  }
  function stored(value: unknown): Stored {
    const v = value as Stored;
    return { action: externalActionSchema.parse(v.action), result: actionResultSchema.parse(v.result) };
  }
  async function event(c: pg.PoolClient, ctx: OperationContext, id: string, status: string) {
    const eid = newId('evt'),
      at = new Date().toISOString();
    await c.query('insert into connect.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5)', [
      newId('obx'),
      ctx.actor.orgId,
      ctx.actor.actorId,
      eid,
      {
        version: 1,
        eventId: eid,
        orgId: ctx.actor.orgId,
        topic: 'connect.action.changed',
        payload: { actionId: id, status },
        occurredAt: at,
      },
    ]);
    const aid = newId('evt');
    await c.query('insert into connect.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5)', [
      newId('obx'),
      ctx.actor.orgId,
      ctx.actor.actorId,
      aid,
      {
        version: 1,
        eventId: aid,
        orgId: ctx.actor.orgId,
        topic: 'governance.audit.requested',
        occurredAt: at,
        payload: {
          version: 1,
          eventId: aid,
          actor: ctx.actor,
          action: 'connect.action.changed',
          objectType: 'action',
          objectId: id,
          occurredAt: at,
          outcome: 'allowed',
          details: { status },
        },
      },
    ]);
  }
  async function position(
    c: pg.PoolClient,
    ctx: OperationContext,
    integrationId: string,
    repositoryId: string,
  ): Promise<ReconcilePosition> {
    await scope(c, integrationId, repositoryId);
    await c.query(
      'insert into connect.reconcile_cursor(id,org_id,created_by,integration_id,repository_id) values($1,$2,$3,$4,$5) on conflict(org_id,integration_id,repository_id) do nothing',
      [newId('cur'), ctx.actor.orgId, ctx.actor.actorId, integrationId, repositoryId],
    );
    const r = await c.query<{ version: number; cursor: string | null; high_watermark: Date | null }>(
      'select version,cursor,high_watermark from connect.reconcile_cursor where integration_id=$1 and repository_id=$2 for update',
      [integrationId, repositoryId],
    );
    const v = r.rows[0]!;
    return {
      version: v.version,
      cursor: v.cursor,
      highWatermark: v.high_watermark ? v.high_watermark.toISOString() : null,
    };
  }
  return {
    scope: (ctx, i, r) => tx(ctx, (c) => scope(c, i, r)),
    register: (ctx, a) =>
      tx(ctx, async (c) => {
        await scope(c, a.integrationId, a.targetId);
        const result: ActionResult = { version: 1, actionId: a.actionId, status: 'pending' };
        await c.query(
          'insert into connect.outbound_action(id,org_id,created_by,integration_id,action_key,request_hash,target,state,result) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(org_id,action_key) do nothing',
          [
            a.actionId,
            ctx.actor.orgId,
            ctx.actor.actorId,
            a.integrationId,
            a.idempotencyKey,
            a.requestHash,
            a.targetId,
            'pending',
            { action: a, result },
          ],
        );
        const r = await c.query<{ result: unknown }>(
          'select result from connect.outbound_action where action_key=$1 for update',
          [a.idempotencyKey],
        );
        const current = stored(r.rows[0]?.result);
        if (JSON.stringify(current.action) !== JSON.stringify(a)) throw new Error('Action key conflicts');
        // Registration and its trace are committed before any remote call. Duplicate registration emits no second event.
        const receipt = await c.query(
          'insert into connect.consumer_receipt(id,org_id,created_by,event_id,consumer) values($1,$2,$3,$4,$5) on conflict(org_id,event_id,consumer) do nothing returning id',
          [newId('rcp'), ctx.actor.orgId, ctx.actor.actorId, a.actionId, 'connect.action.registration'],
        );
        if (receipt.rowCount) await event(c, ctx, a.actionId, 'pending');
        return current.result;
      }),
    load: (ctx, id) => tx(ctx, async (c) => stored((await row(c, id)).result).action),
    query: (ctx, id) => tx(ctx, async (c) => stored((await row(c, id)).result).result),
    claim: (ctx, id) =>
      tx(ctx, async (c) => {
        const r = await row(c, id),
          s = stored(r.result);
        await scope(c, s.action.integrationId, s.action.targetId);
        if (r.leased || r.delayed || s.result.status === 'succeeded' || s.result.status === 'failed')
          return { ...s, leaseToken: null, dispatch: false };
        const token = randomUUID(),
          dispatch = s.result.status === 'pending';
        const result: ActionResult = { version: 1, actionId: id, status: 'unknown' };
        await c.query(
          "update connect.outbound_action set state='unknown',lease_token=$2,lease_until=clock_timestamp()+$3*interval '1 millisecond',result=$4,updated_at=now(),version=version+1 where id=$1",
          [id, token, leaseMs, { action: s.action, result }],
        );
        return { action: s.action, result, leaseToken: token, dispatch };
      }),
    settle: (ctx, id, token, result) =>
      tx(ctx, async (c) => {
        const r = await row(c, id),
          s = stored(r.result);
        await scope(c, s.action.integrationId, s.action.targetId);
        if (!r.leased || r.lease_token !== token || result.actionId !== id) throw new Error('Stale lease');
        await c.query(
          'update connect.outbound_action set state=$2,result=$3,retry_at=$4,lease_token=null,lease_until=null,updated_at=now(),version=version+1 where id=$1',
          [id, result.status, { action: s.action, result }, result.retryAt ?? null],
        );
        await event(c, ctx, id, result.status);
      }),
    position: (ctx, i, r) => tx(ctx, (c) => position(c, ctx, i, r)),
    checkpoint: (ctx, i, r, previous, next) =>
      tx(ctx, async (c) => {
        const current = await position(c, ctx, i, r);
        if (
          current.version !== previous.version ||
          current.cursor !== previous.cursor ||
          current.highWatermark !== previous.highWatermark
        )
          throw new Error('Cursor conflict');
        await c.query(
          'update connect.reconcile_cursor set cursor=$3,high_watermark=$4,version=version+1,updated_at=now() where integration_id=$1 and repository_id=$2',
          [i, r, next.cursor, next.highWatermark],
        );
        return { ...next, version: current.version + 1 };
      }),
  };
}
