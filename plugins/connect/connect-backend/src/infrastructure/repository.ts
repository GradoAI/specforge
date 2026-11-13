import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { newId, isId, jsonValueSchema, type OperationContext } from '@fasrun/contracts-core';
import { credentialEnvelopeSchema, type InboxReceipt, type Integration } from '@fasrun/plugin-connect-common';
import type { OutboxEvent } from '@fasrun/backend-plugin-api';
import type { ConnectRepository } from '../common/ports.js';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function createConnectRepository(pool: pg.Pool): ConnectRepository {
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
      throw new Error('Connect persistence unavailable');
    } finally {
      client.release();
    }
  }
  function transaction<T>(context: OperationContext, work: (client: pg.PoolClient) => Promise<T>) {
    return scoped(context.actor.orgId, work);
  }
  async function enqueue(
    client: pg.PoolClient,
    context: OperationContext,
    topic: string,
    payload: OutboxEvent['payload'],
  ) {
    const event: OutboxEvent = {
      version: 1,
      eventId: newId('evt'),
      orgId: context.actor.orgId,
      topic,
      payload,
      occurredAt: new Date().toISOString(),
    };
    await client.query('insert into connect.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5)', [
      newId('obx'),
      event.orgId,
      context.actor.actorId,
      event.eventId,
      event,
    ]);
    const auditId = newId('evt');
    const auditEvent = {
      version: 1,
      eventId: auditId,
      actor: context.actor,
      action: topic,
      objectType: context.object.type,
      objectId: context.object.id,
      occurredAt: event.occurredAt,
      outcome: 'allowed',
      details: { eventId: event.eventId },
    };
    await client.query('insert into connect.outbox(id,org_id,created_by,event_id,event) values($1,$2,$3,$4,$5)', [
      newId('obx'),
      event.orgId,
      context.actor.actorId,
      auditId,
      {
        version: 1,
        eventId: auditId,
        orgId: event.orgId,
        topic: 'governance.audit.requested',
        payload: auditEvent,
        occurredAt: event.occurredAt,
      },
    ]);
  }
  return {
    configure(context, integration, binding) {
      return transaction(context, async (c) => {
        if (
          integration.orgId !== context.actor.orgId ||
          binding.scope.orgId !== integration.orgId ||
          binding.integrationId !== integration.id
        )
          throw new Error('Scope mismatch');
        await c.query(
          'insert into connect.integration(id,org_id,created_by,installation_id,provider,active) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set active=excluded.active,updated_at=now(),version=connect.integration.version+1 where connect.integration.installation_id=excluded.installation_id and connect.integration.org_id=excluded.org_id',
          [
            integration.id,
            integration.orgId,
            context.actor.actorId,
            integration.installationId,
            integration.provider,
            integration.active,
          ],
        );
        const current = await c.query('select 1 from connect.integration where id=$1 and installation_id=$2', [
          integration.id,
          integration.installationId,
        ]);
        if (!current.rowCount) throw new Error('Immutable installation');
        await c.query(
          'insert into connect.repository_binding(id,org_id,created_by,integration_id,repository_id,team_id,project_id,active) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(org_id,integration_id,repository_id) do update set team_id=excluded.team_id,project_id=excluded.project_id,active=excluded.active,updated_at=now(),version=connect.repository_binding.version+1',
          [
            binding.id,
            integration.orgId,
            context.actor.actorId,
            integration.id,
            binding.repositoryId,
            binding.scope.teamId,
            binding.scope.projectId,
            binding.active,
          ],
        );
        await enqueue(c, context, 'connect.integration.configured', {
          integrationId: integration.id,
          repositoryId: binding.repositoryId,
        });
      });
    },
    integration(context, id) {
      return transaction(context, async (c) => {
        const r = await c.query<{
          id: string;
          org_id: string;
          installation_id: string;
          provider: 'github';
          active: boolean;
        }>('select id,org_id,installation_id,provider,active from connect.integration where id=$1', [id]);
        const row = r.rows[0];
        return row
          ? ({
              id: row.id,
              orgId: row.org_id,
              installationId: row.installation_id,
              provider: row.provider,
              active: row.active,
            } satisfies Integration)
          : undefined;
      });
    },
    binding(context, installationId, repositoryId) {
      return transaction(context, async (c) => {
        const r = await c.query<{
          id: string;
          integration_id: string;
          repository_id: string;
          org_id: string;
          team_id: string;
          project_id: string;
          active: boolean;
        }>(
          'select b.* from connect.repository_binding b join connect.integration i on i.id=b.integration_id and i.org_id=b.org_id where i.installation_id=$1 and i.active and b.repository_id=$2',
          [installationId, repositoryId],
        );
        const row = r.rows[0];
        return row
          ? {
              id: row.id,
              integrationId: row.integration_id,
              repositoryId: row.repository_id,
              scope: { orgId: row.org_id, teamId: row.team_id, projectId: row.project_id },
              active: row.active,
            }
          : undefined;
      });
    },
    accept(context, repositoryId, event) {
      return transaction(context, async (c) => {
        if (event.orgId !== context.actor.orgId) throw new Error('Scope mismatch');
        // Lock the actual active binding again inside the commit transaction; concurrent disable cannot slip through.
        const binding = await c.query(
          'select b.id from connect.repository_binding b join connect.integration i on i.id=b.integration_id and i.org_id=b.org_id where i.installation_id=$1 and b.repository_id=$2 and i.active and b.active and b.project_id=$3 and b.team_id=$4 for share of b,i',
          [event.installationId, repositoryId, context.scope.projectId, context.scope.teamId],
        );
        if (!binding.rowCount) throw new Error('Binding inactive');
        const receipt: InboxReceipt = {
          version: 1,
          receiptId: newId('inb'),
          deliveryId: event.deliveryId,
          persistedAt: new Date().toISOString(),
        };
        const result = await c.query(
          'insert into connect.inbox(id,org_id,created_by,installation_id,delivery_id,repository_id,event,receipt) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(org_id,installation_id,delivery_id) do nothing returning id',
          [
            receipt.receiptId,
            event.orgId,
            context.actor.actorId,
            event.installationId,
            event.deliveryId,
            repositoryId,
            event,
            receipt,
          ],
        );
        if (!result.rowCount) {
          const old = (
            await c.query<{ receipt: InboxReceipt; event: unknown; repository_id: string }>(
              'select receipt,event,repository_id from connect.inbox where installation_id=$1 and delivery_id=$2',
              [event.installationId, event.deliveryId],
            )
          ).rows[0]!;
          // Arrival time may differ on retry; content and stable source identity may not.
          const stable = (v: unknown) => {
            const o = { ...(v as Record<string, unknown>) };
            delete o.receivedAt;
            return canonical(o);
          };
          if (old.repository_id !== repositoryId || stable(old.event) !== stable(event))
            throw new Error('Delivery conflict');
          return old.receipt;
        }
        await enqueue(
          c,
          context,
          'connect.inbox.accepted',
          jsonValueSchema.parse(JSON.parse(JSON.stringify({ receiptId: receipt.receiptId, repositoryId, event }))),
        );
        return receipt;
      });
    },
    saveObject(context, value) {
      return transaction(context, async (c) => {
        const bound = await c.query(
          'select b.id from connect.repository_binding b join connect.integration i on i.id=b.integration_id and i.org_id=b.org_id where i.id=$1 and b.repository_id=$2 and i.active and b.active and b.project_id=$3 and b.team_id=$4 for share of b,i',
          [value.integrationId, value.repositoryId, context.scope.projectId, context.scope.teamId],
        );
        if (!bound.rowCount) throw new Error('Binding inactive');
        const existing = await c.query<{ repository_id: string }>(
          'select repository_id from connect.external_object where integration_id=$1 and external_id=$2 and kind=$3',
          [value.integrationId, value.externalId, value.kind],
        );
        if (existing.rows[0] && existing.rows[0].repository_id !== value.repositoryId)
          throw new Error('External object binding conflict');
        const changed = await c.query(
          'insert into connect.external_object(id,org_id,created_by,integration_id,repository_id,external_id,kind,observed_at,digest) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(org_id,integration_id,external_id,kind) do update set observed_at=excluded.observed_at,digest=excluded.digest,updated_at=now(),version=connect.external_object.version+1 where connect.external_object.observed_at<excluded.observed_at and connect.external_object.repository_id=excluded.repository_id returning id',
          [
            value.id,
            context.actor.orgId,
            context.actor.actorId,
            value.integrationId,
            value.repositoryId,
            value.externalId,
            value.kind,
            value.observedAt,
            value.digest,
          ],
        );
        if (!changed.rowCount) {
          const current = await c.query<{ repository_id: string }>(
            'select repository_id from connect.external_object where integration_id=$1 and external_id=$2 and kind=$3',
            [value.integrationId, value.externalId, value.kind],
          );
          if (current.rows[0]?.repository_id !== value.repositoryId)
            throw new Error('External object binding conflict');
          return;
        }
        await enqueue(c, context, 'connect.object.observed', {
          integrationId: value.integrationId,
          externalId: value.externalId,
        });
      });
    },
    putCredential(context, envelope, expectedVersion) {
      return transaction(context, async (c) => {
        if (envelope.orgId !== context.actor.orgId) throw new Error('Wrong tenant');
        if (
          !(
            await c.query('select id from connect.integration where id=$1 and active for share', [
              envelope.integrationId,
            ])
          ).rowCount
        )
          throw new Error('Integration inactive');
        await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
          `connect.credential:${envelope.orgId}:${envelope.integrationId}`,
        ]);
        const existing = (
          await c.query<{ credential_version: string }>(
            'select credential_version from connect.credential_envelope where integration_id=$1 and active',
            [envelope.integrationId],
          )
        ).rows[0];
        if ((existing?.credential_version ?? null) !== expectedVersion) throw new Error('Credential version conflict');
        await c.query(
          'update connect.credential_envelope set active=false,version=version+1,updated_at=now() where integration_id=$1 and active',
          [envelope.integrationId],
        );
        await c.query(
          'insert into connect.credential_envelope(id,org_id,created_by,integration_id,credential_version,envelope,active) values($1,$2,$3,$4,$5,$6,true)',
          [
            newId('cre'),
            envelope.orgId,
            context.actor.actorId,
            envelope.integrationId,
            envelope.credentialVersion,
            envelope,
          ],
        );
        await enqueue(c, context, 'connect.credential.rotated', {
          integrationId: envelope.integrationId,
          credentialVersion: envelope.credentialVersion,
        });
      });
    },
    credential(context, integrationId) {
      return transaction(context, async (c) => {
        const result = await c.query<{ envelope: unknown }>(
          'select envelope from connect.credential_envelope where integration_id=$1 and active',
          [integrationId],
        );
        return result.rows[0] ? credentialEnvelopeSchema.parse(result.rows[0].envelope) : undefined;
      });
    },
    outbox(orgId) {
      return {
        ownerPlugin: 'connect',
        claim({ workerId, limit, leaseUntil }) {
          return scoped(orgId, async (c) => {
            if (
              !workerId ||
              !Number.isInteger(limit) ||
              limit < 1 ||
              limit > 1000 ||
              !(Date.parse(leaseUntil) > Date.now())
            )
              throw new Error('Invalid lease');
            const token = randomUUID();
            const rows = await c.query<{ event: OutboxEvent; lease_token: string }>(
              'with picked as (select id from connect.outbox where delivered_at is null and retry_at<=now() and (lease_until is null or lease_until<=now()) order by created_at,id for update skip locked limit $1) update connect.outbox o set lease_token=$2,lease_until=$3,version=o.version+1,updated_at=now() from picked where o.id=picked.id returning o.event,o.lease_token',
              [limit, token, leaseUntil],
            );
            return rows.rows.map((row) => ({ event: row.event, leaseToken: row.lease_token }));
          });
        },
        ack({ eventId, leaseToken }) {
          return scoped(orgId, async (c) => {
            const r = await c.query(
              'update connect.outbox set delivered_at=now(),lease_token=null,lease_until=null,version=version+1,updated_at=now() where event_id=$1 and lease_token=$2 and lease_until>now() and delivered_at is null',
              [eventId, leaseToken],
            );
            if (!r.rowCount) throw new Error('Lease expired');
          });
        },
        retry({ eventId, leaseToken, retryAt }) {
          return scoped(orgId, async (c) => {
            if (!Number.isFinite(Date.parse(retryAt))) throw new Error('Invalid retry');
            const r = await c.query(
              'update connect.outbox set retry_at=$3,lease_token=null,lease_until=null,version=version+1,updated_at=now() where event_id=$1 and lease_token=$2 and lease_until>now() and delivered_at is null',
              [eventId, leaseToken, retryAt],
            );
            if (!r.rowCount) throw new Error('Lease expired');
          });
        },
      };
    },
  };
}
