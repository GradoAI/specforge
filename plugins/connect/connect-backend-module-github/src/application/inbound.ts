import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { dataReferenceSchema, newId, type JsonValue } from '@fasrun/contracts-core';
import { inboxReceiptSchema, type InboxEvent } from '@fasrun/plugin-connect-common';
import type { GitHubRepositoryRoute } from '@fasrun/plugin-connect-node';
import type { GitHubDependencies } from './ports.js';
import { repositoryPath, type GitHubHttp } from '../infrastructure/http.js';
export const POLL_INTERVAL_MS = 15 * 60 * 1000;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid GitHub object');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) return value;
  throw new Error('Invalid external ID');
}
function number(value: unknown): number {
  const n = Number(id(value));
  if (!Number.isSafeInteger(n)) throw new Error('Invalid external number');
  return n;
}
export function createInbound(deps: GitHubDependencies, http: GitHubHttp) {
  const clock = deps.clock ?? (() => new Date());
  async function current(route: GitHubRepositoryRoute) {
    if (
      route.context.actor.orgId !== route.scope.orgId ||
      route.context.actor.actorKind !== 'member' ||
      !(await deps.authorize({
        ...route.context,
        scope: route.scope,
        permission: 'integration.manage',
        object: { type: 'repository', id: route.repositoryId },
      }))
    )
      throw new Error('Current route denied');
    const repo = object((await http.call(route, repositoryPath(route))).value);
    if (id(repo.id) !== route.repositoryId) throw new Error('Renamed route points to another repository');
  }
  function route(installationId: string, repositoryId: string) {
    const rows = deps.routes.filter((x) => x.installationId === installationId && x.repositoryId === repositoryId);
    if (rows.length !== 1) throw new Error('Unconfigured route');
    return rows[0]!;
  }
  async function reference(r: GitHubRepositoryRoute, source: string, data: JsonValue) {
    const ref = dataReferenceSchema.parse(await deps.references.external(r, source, data));
    if (ref.orgId !== r.scope.orgId || ref.labels.trust !== 'untrusted' || ref.labels.source.kind !== 'external')
      throw new Error('Invalid external reference');
    return ref;
  }
  async function accept(
    r: GitHubRepositoryRoute,
    deliveryId: string,
    externalObjectId: string,
    eventType: string,
    data: JsonValue,
  ) {
    const event: InboxEvent = {
      version: 1,
      orgId: r.scope.orgId,
      installationId: r.installationId,
      deliveryId,
      externalObjectId,
      eventType,
      receivedAt: clock().toISOString(),
      signatureVerified: true,
      payloadRef: await reference(r, externalObjectId, data),
    };
    const receipt = inboxReceiptSchema.parse(await deps.core.accept(r.context, r.repositoryId, event));
    if (receipt.deliveryId !== deliveryId) throw new Error('Invalid durable receipt');
    return receipt;
  }
  async function readObject(r: GitHubRepositoryRoute, kind: 'issue' | 'pull_request', n: number) {
    const path = repositoryPath(r);
    const value = object((await http.call(r, `${path}/${kind === 'issue' ? 'issues' : 'pulls'}/${n}`)).value);
    if (number(value.number) !== n) throw new Error('Mismatched current object');
    const externalId = id(value.id),
      reviews: Record<string, JsonValue>[] = [],
      comments: Record<string, JsonValue>[] = [];
    if (kind === 'pull_request')
      for await (const page of http.pages(r, `${path}/pulls/${n}/reviews?per_page=100`))
        for (const entry of page) {
          const v = object(entry),
            u = object(v.user);
          reviews.push({
            id: id(v.id),
            userId: id(u.id),
            userType: String(u.type),
            commitId: String(v.commit_id),
            state: String(v.state),
            submittedAt: typeof v.submitted_at === 'string' ? v.submitted_at : null,
          });
        }
    for await (const page of http.pages(r, `${path}/issues/${n}/comments?per_page=100`))
      for (const entry of page) {
        const v = object(entry),
          u = object(v.user);
        comments.push({
          id: id(v.id),
          userId: id(u.id),
          userType: String(u.type),
          body: typeof v.body === 'string' ? v.body : '',
          updatedAt: String(v.updated_at),
        });
      }
    // Re-read catches changed PR fields; reviews/comments across pages are NOT an atomic remote snapshot. T017 rereads before gate decisions.
    const final = object((await http.call(r, `${path}/${kind === 'issue' ? 'issues' : 'pulls'}/${n}`)).value);
    if (digest(value) !== digest(final)) throw new Error('GitHub object changed during observation');
    const user = object(value.user);
    const snapshot: Record<string, JsonValue> = {
      id: externalId,
      number: n,
      kind,
      userId: id(user.id),
      userType: String(user.type),
      body: typeof value.body === 'string' ? value.body : '',
      title: typeof value.title === 'string' ? value.title : '',
      state: String(value.state),
      updatedAt: String(value.updated_at),
      comments,
      reviews,
    };
    if (kind === 'pull_request') {
      snapshot.headSha = String(object(value.head).sha);
      snapshot.merged = value.merged === true;
      snapshot.mergeCommitSha = typeof value.merge_commit_sha === 'string' ? value.merge_commit_sha : null;
    }
    return { snapshot, externalId, observedAt: clock().toISOString() };
  }
  async function observe(r: GitHubRepositoryRoute, kind: 'issue' | 'pull_request', n: number) {
    await current(r);
    const { snapshot, externalId, observedAt } = await readObject(r, kind, n);
    const stateHash = digest(snapshot),
      key = `github:${r.repositoryId}:${kind}:${externalId}:${stateHash}`;
    const association = await deps.resolveExternal(r.context, {
      provider: 'github',
      issuer: `github:installation:${r.installationId}`,
      subject: id(snapshot.userId),
      eventId: key,
    });
    // Unresolved is durable identity-side state; no guessed login/member or management identity is substituted.
    const content = {
      ...snapshot,
      association:
        association.kind === 'resolved' ? { kind: 'resolved', memberId: association.memberId } : { kind: 'unresolved' },
    } as JsonValue;
    const receipt = await accept(r, `${key}:${digest(association)}`, externalId, 'github.current.observed', content);
    await deps.core.observe(r.context, {
      id: newId('ext'),
      integrationId: r.integrationId,
      repositoryId: r.repositoryId,
      externalId,
      kind,
      observedAt,
      digest: stateHash,
    });
    return receipt;
  }
  return {
    async receive(bytes: Buffer, headers: Readonly<Record<string, string>>) {
      bytes = Buffer.from(bytes);
      headers = { ...headers };
      if (bytes.length > 262144) throw new Error('Webhook rejected');
      let payload: Record<string, unknown>;
      try {
        payload = object(JSON.parse(bytes.toString('utf8')));
      } catch {
        throw new Error('Webhook rejected');
      }
      const installationId = id(object(payload.installation).id),
        repositoryId = id(object(payload.repository).id),
        r = route(installationId, repositoryId);
      const signature = headers['x-hub-signature-256'];
      if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) throw new Error('Webhook rejected');
      const verified = await deps.credentials.webhookSecret(installationId, (secret) => {
        const expected = createHmac('sha256', secret).update(bytes).digest();
        return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
      });
      if (!verified) throw new Error('Webhook rejected');
      const eventType = headers['x-github-event'],
        deliveryId = headers['x-github-delivery'];
      if (
        !deliveryId ||
        deliveryId.length > 200 ||
        !['issues', 'issue_comment', 'pull_request', 'pull_request_review', 'pull_request_review_comment'].includes(
          eventType ?? '',
        )
      )
        throw new Error('Webhook rejected');
      await current(r);
      const subject = object(payload.pull_request ?? payload.issue);
      const kind = payload.pull_request || subject.pull_request ? 'pull_request' : 'issue';
      const externalId = id(subject.id);
      number(subject.number);
      return accept(r, deliveryId, externalId, 'github.webhook.received', {
        kind,
        number: number(subject.number),
        repositoryId,
        installationId,
        payload: payload as JsonValue,
      });
    },
    /** Called by durable inbox consumer. An old delivery is a hint to reread current API facts, never a state overwrite. */
    async process(installationId: string, repositoryId: string, kind: 'issue' | 'pull_request', n: number) {
      return observe(route(installationId, repositoryId), kind, number(n));
    },
    async reconcile(r: GitHubRepositoryRoute) {
      r = structuredClone(route(r.installationId, r.repositoryId));
      await current(r);
      let position = await deps.actions.position(r.context, r.integrationId, r.repositoryId);
      const started = clock().toISOString(),
        since = position.highWatermark
          ? new Date(Date.parse(position.highWatermark) - POLL_INTERVAL_MS).toISOString()
          : '1970-01-01T00:00:00.000Z';
      // Restart overlaps rather than resuming an unstable offset after failure. Cursor is trace/checkpoint, not a no-loss claim.
      for (const kind of ['issue', 'pull_request'] as const) {
        let pageNumber = 0;
        const path =
          repositoryPath(r) +
          (kind === 'issue'
            ? `/issues?state=all&sort=updated&direction=asc&since=${encodeURIComponent(since)}&per_page=100`
            : '/pulls?state=all&sort=updated&direction=asc&per_page=100');
        for await (const page of http.pages(r, path)) {
          for (const entry of page) {
            const v = object(entry);
            if (kind === 'issue' && v.pull_request) continue;
            await observe(r, kind, number(v.number));
          }
          position = await deps.actions.checkpoint(r.context, r.integrationId, r.repositoryId, position, {
            cursor: JSON.stringify({ kind, page: ++pageNumber }),
            highWatermark: position.highWatermark,
          });
        }
      }
      return deps.actions.checkpoint(r.context, r.integrationId, r.repositoryId, position, {
        cursor: null,
        highWatermark: started,
      });
    },
    start(onFailure: (reason: 'reconcile_failed') => Promise<void>) {
      let stopped = false,
        flight: Promise<void> | undefined;
      const tick = () => {
        if (stopped || flight) return;
        flight = (async () => {
          for (const r of deps.routes) {
            if (stopped) break;
            try {
              await this.reconcile(r);
            } catch {
              await onFailure('reconcile_failed');
            }
          }
        })().finally(() => {
          flight = undefined;
        });
        void flight.catch(() => {
          stopped = true;
        });
      };
      const timer = setInterval(tick, POLL_INTERVAL_MS);
      timer.unref();
      tick();
      return {
        async stop() {
          stopped = true;
          clearInterval(timer);
          await flight;
        },
      };
    },
  };
}
