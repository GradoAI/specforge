import type pg from 'pg';
import { isId, newId, jsonValueSchema } from '@fasrun/contracts-core';
import type { AgentResult } from '@fasrun/plugin-orchestration-common';
import type { AuditEvent } from '@fasrun/plugin-governance-common';
import type { AgentRecord, AgentRepository } from '../../application/agents/ports.js';

export function createAgentRepository(pool: pg.Pool): AgentRepository {
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
      throw new Error('Agent repository operation failed');
    } finally {
      client.release();
    }
  }
  async function append(client: pg.PoolClient, event: AuditEvent) {
    const envelope = {
      version: 1,
      eventId: event.eventId,
      orgId: event.actor.orgId,
      topic: 'governance.audit.requested',
      occurredAt: event.occurredAt,
      payload: jsonValueSchema.parse(event),
    };
    await client.query('insert into orchestration.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5)', [
      newId('evt'),
      event.actor.orgId,
      event.actor.actorId,
      event.eventId,
      envelope,
    ]);
  }
  async function latest(client: pg.PoolClient, orgId: string, callId: string): Promise<AgentRecord | null> {
    const result = await client.query<{ record: AgentRecord }>(
      'select record from orchestration.agent_call where org_id=$1 and call_id=$2 order by attempt desc limit 1',
      [orgId, callId],
    );
    return result.rows[0]?.record ?? null;
  }
  async function lock(client: pg.PoolClient, orgId: string, callId: string) {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([orgId, callId])]);
  }
  return {
    get: (orgId, callId) => scoped(orgId, (client) => latest(client, orgId, callId)),
    claim: (record, event) =>
      scoped(record.call.orgId, async (client) => {
        const { call } = record;
        await lock(client, call.orgId, call.callId);
        const previous = await latest(client, call.orgId, call.callId);
        if (previous) {
          if (
            previous.call.workId !== call.workId ||
            previous.call.stepRunId !== call.stepRunId ||
            previous.call.actor.actorId !== call.actor.actorId
          )
            throw new Error('Call identity conflict');
          if (previous.call.attempt === call.attempt) {
            if (previous.requestHash !== record.requestHash) throw new Error('Attempt identity conflict');
            return previous;
          }
          if (
            call.attempt !== previous.call.attempt + 1 ||
            previous.state === 'success' ||
            (previous.state === 'pending' && Date.parse(previous.deadlineAt) > Date.now())
          )
            throw new Error('Attempt conflict');
        } else if (call.attempt !== 1) throw new Error('First attempt must be one');
        await client.query(
          `insert into orchestration.agent_call(id,org_id,created_by,call_id,work_id,step_run_id,attempt,request_hash,state,deadline,record)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            newId('acl'),
            call.orgId,
            call.actor.actorId,
            call.callId,
            call.workId,
            call.stepRunId,
            call.attempt,
            record.requestHash,
            record.state,
            record.deadlineAt,
            record,
          ],
        );
        await append(client, event);
        return record;
      }),
    complete: (record, result: AgentResult, event) =>
      scoped(record.call.orgId, async (client) => {
        const { call } = record;
        await lock(client, call.orgId, call.callId);
        const current = await latest(client, call.orgId, call.callId);
        if (!current || current.call.attempt !== call.attempt || current.requestHash !== record.requestHash)
          throw new Error('Attempt CAS lost');
        if (current.result) return current;
        const completed: AgentRecord = { ...current, state: result.status, result };
        const changed = await client.query(
          `update orchestration.agent_call set state=$4,record=$5,version=version+1,updated_at=clock_timestamp()
        where org_id=$1 and call_id=$2 and attempt=$3 and state='pending'
        and ($4 <> 'success' or deadline > clock_timestamp()) returning id`,
          [call.orgId, call.callId, call.attempt, result.status, completed],
        );
        if (!changed.rowCount) throw new Error('Result CAS lost or expired');
        await append(client, event);
        return completed;
      }),
    audit: (event) => scoped(event.actor.orgId, (client) => append(client, event)),
  };
}
