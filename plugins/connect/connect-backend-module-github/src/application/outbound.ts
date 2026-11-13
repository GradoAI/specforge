import { z } from 'zod';
import { operationContextSchema, type OperationContext } from '@fasrun/contracts-core';
import { externalActionSchema, type ExternalAction, type ActionResult } from '@fasrun/plugin-connect-common';
import type { GitHubDependencies } from './ports.js';
import type { GitHubHttp } from '../infrastructure/http.js';
import { GitHubFailure, repositoryPath } from '../infrastructure/http.js';
import { digest } from './inbound.js';
const purpose = z.enum(['accepted', 'needs_human', 'result', 'failure']);
const comment = z.strictObject({
  kind: z.literal('comment'),
  number: z.number().int().positive(),
  body: z.string().max(60000),
  purpose,
});
const update = z.strictObject({
  kind: z.literal('update_comment'),
  number: z.number().int().positive(),
  commentId: z.string().regex(/^[1-9][0-9]*$/),
  expectedBodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  body: z.string().max(60000),
  purpose,
});
const pr = z.strictObject({
  kind: z.literal('create_spec_pr'),
  workId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  layer: z.enum(['requirements', 'design', 'tasks']),
  base: z.string().regex(/^[a-zA-Z0-9_/-]+$/),
  headSha: z.string().regex(/^[a-f0-9]{40}$/),
  title: z.string().min(1).max(256),
  body: z.string().max(60000),
});
export const gitHubActionPayloadSchema = z.discriminatedUnion('kind', [comment, update, pr]);
function remoteId(value: unknown): string {
  if (
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === 'string' && /^[1-9][0-9]*$/.test(value))
  )
    return String(value);
  throw new GitHubFailure('invalid_response');
}
export function createOutbound(deps: GitHubDependencies, http: GitHubHttp, botUserId: string) {
  if (!/^[1-9][0-9]*$/.test(botUserId)) throw new Error('Configured immutable GitHub App user ID required');
  async function prepared(context: OperationContext, action: ExternalAction, checkRemote = true) {
    const routes = deps.routes.filter(
      (r) =>
        r.integrationId === action.integrationId &&
        r.repositoryId === action.targetId &&
        r.scope.orgId === context.actor.orgId,
    );
    if (routes.length !== 1) throw new Error('Unconfigured outbound route');
    const route = routes[0]!;
    if (
      !(await deps.authorize({
        ...context,
        permission: 'integration.manage',
        scope: route.scope,
        object: { type: 'repository', id: route.repositoryId },
      }))
    )
      throw new Error('Current outbound authorization denied');
    const payload = gitHubActionPayloadSchema.parse(await deps.references.outbound(context, action.payloadRef, route));
    if (payload.kind !== action.kind || digest(payload) !== action.requestHash)
      throw new Error('Action content changed');
    const marker = `<!-- fasrun-action:${digest({ org: context.actor.orgId, key: action.idempotencyKey })} -->`;
    if (payload.body.includes('<!-- fasrun-action:')) throw new Error('Untrusted action marker');
    const body = `${payload.body}\n\n${marker}`;
    const path = repositoryPath(route);
    if (checkRemote) {
      const repo = (await http.call(route, path)).value as { id?: unknown };
      if (String(repo.id) !== route.repositoryId) throw new Error('Repository identity changed');
    }
    return { route, payload, marker, body, path };
  }
  async function query(context: OperationContext, action: ExternalAction) {
    const p = await prepared(context, action),
      found: string[] = [];
    if (p.payload.kind === 'create_spec_pr') {
      const branch = `fasrun/spec/${p.payload.workId}/${p.payload.layer}`;
      for await (const page of http.pages(
        p.route,
        `${p.path}/pulls?state=all&head=${encodeURIComponent(`${p.route.owner}:${branch}`)}&per_page=100`,
      ))
        for (const raw of page) {
          const v = raw as {
            id: unknown;
            body?: string;
            user?: { id: unknown };
            head?: { ref: string; sha: string; repo?: { id: unknown } };
            base?: { ref: string };
          };
          if (v.head?.ref !== branch) continue;
          if (
            String(v.user?.id) !== botUserId ||
            v.body !== p.body ||
            v.head.sha !== p.payload.headSha ||
            String(v.head.repo?.id) !== p.route.repositoryId ||
            v.base?.ref !== p.payload.base
          )
            throw new GitHubFailure('invalid_response', undefined, true);
          found.push(remoteId(v.id));
        }
    } else {
      for await (const page of http.pages(p.route, `${p.path}/issues/${p.payload.number}/comments?per_page=100`))
        for (const raw of page) {
          const v = raw as { id: unknown; body?: string; user?: { id: unknown } };
          if (p.payload.kind === 'update_comment' && String(v.id) !== p.payload.commentId) continue;
          if (v.body?.includes(p.marker) && String(v.user?.id) === botUserId) {
            if (v.body !== p.body) throw new GitHubFailure('invalid_response', undefined, true);
            found.push(remoteId(v.id));
          }
        }
    }
    if (found.length > 1) throw new GitHubFailure('invalid_response', undefined, true);
    return found[0];
  }
  async function send(context: OperationContext, action: ExternalAction, onSend: () => void) {
    const p = await prepared(context, action);
    let response: unknown;
    if (p.payload.kind === 'create_spec_pr') {
      const branch = `fasrun/spec/${p.payload.workId}/${p.payload.layer}`;
      // T017 publishes exact files and expected head; this adapter never updates refs or protected branches.
      const ref = (await http.call(p.route, `${p.path}/git/ref/heads/${branch}`)).value as { object?: { sha: string } };
      if (ref.object?.sha !== p.payload.headSha || branch === p.payload.base)
        throw new GitHubFailure('invalid_response', undefined, true);
      response = (
        await http.call(
          p.route,
          `${p.path}/pulls`,
          'POST',
          {
            title: p.payload.title,
            body: p.body,
            base: p.payload.base,
            head: branch,
          },
          onSend,
        )
      ).value;
    } else if (p.payload.kind === 'update_comment') {
      const current = (await http.call(p.route, `${p.path}/issues/comments/${p.payload.commentId}`)).value as {
        user?: { id: unknown };
        body?: string;
        issue_url?: string;
      };
      if (
        String(current.user?.id) !== botUserId ||
        digest(current.body ?? '') !== p.payload.expectedBodyHash ||
        current.issue_url?.split('/').at(-1) !== String(p.payload.number)
      )
        throw new GitHubFailure('invalid_response', undefined, true);
      response = (
        await http.call(p.route, `${p.path}/issues/comments/${p.payload.commentId}`, 'PATCH', { body: p.body }, onSend)
      ).value;
    } else
      response = (
        await http.call(p.route, `${p.path}/issues/${p.payload.number}/comments`, 'POST', { body: p.body }, onSend)
      ).value;
    return remoteId((response as { id?: unknown }).id);
  }
  async function execute(inputContext: OperationContext, input: ExternalAction): Promise<ActionResult> {
    const context = operationContextSchema.parse(inputContext),
      action = externalActionSchema.parse(input);
    await prepared(context, action, false);
    await deps.actions.register(context, action);
    const claim = await deps.actions.claim(context, action.actionId);
    if (!claim.leaseToken) return claim.result;
    let result: ActionResult;
    let writeStarted = false;
    let reason: Parameters<GitHubDependencies['outcome']>[1]['reason'] = 'remote_unknown';
    try {
      const existing = await query(context, action);
      if (existing) {
        result = { version: 1, actionId: action.actionId, status: 'succeeded', externalId: existing };
        reason = 'delivered';
      } else if (!claim.dispatch) result = { version: 1, actionId: action.actionId, status: 'unknown' };
      else {
        result = {
          version: 1,
          actionId: action.actionId,
          status: 'succeeded',
          externalId: await send(context, action, () => {
            writeStarted = true;
          }),
        };
        reason = 'delivered';
      }
    } catch (error) {
      if (error instanceof GitHubFailure && error.reason === 'rate_limited') {
        result = {
          version: 1,
          actionId: action.actionId,
          status: claim.dispatch ? 'pending' : 'unknown',
          retryAt: error.retryAt,
        };
        reason = 'rate_limited';
      } else if (error instanceof GitHubFailure && error.reason === 'permission') {
        result = { version: 1, actionId: action.actionId, status: claim.dispatch ? 'failed' : 'unknown' };
        reason = 'permission_denied';
      } else if (error instanceof GitHubFailure && error.definite) {
        result = { version: 1, actionId: action.actionId, status: claim.dispatch ? 'failed' : 'unknown' };
        reason = 'request_rejected';
      } else
        result = {
          version: 1,
          actionId: action.actionId,
          status: claim.dispatch && !writeStarted ? 'pending' : 'unknown',
        };
    }
    // If this commit fails after remote success, the durable row stays unknown; retry queries the same marker/branch.
    await deps.outcome(context, { actionId: action.actionId, reason });
    await deps.actions.settle(context, action.actionId, claim.leaseToken, result);
    return result;
  }
  async function queryAction(inputContext: OperationContext, id: string): Promise<ActionResult> {
    const context = operationContextSchema.parse(inputContext),
      claim = await deps.actions.claim(context, id);
    if (!claim.leaseToken) return claim.result;
    let result: ActionResult = { version: 1, actionId: id, status: claim.dispatch ? 'pending' : 'unknown' };
    let reason: Parameters<GitHubDependencies['outcome']>[1]['reason'] = 'query_absent';
    try {
      const found = await query(context, claim.action);
      if (found) {
        result = { version: 1, actionId: id, status: 'succeeded', externalId: found };
        reason = 'delivered';
      }
    } catch (error) {
      if (error instanceof GitHubFailure && error.reason === 'rate_limited') {
        result = { version: 1, actionId: id, status: claim.dispatch ? 'pending' : 'unknown', retryAt: error.retryAt };
        reason = 'rate_limited';
      } else if (error instanceof GitHubFailure && error.reason === 'permission') {
        result = { version: 1, actionId: id, status: claim.dispatch ? 'failed' : 'unknown' };
        reason = 'permission_denied';
      } else if (error instanceof GitHubFailure && error.definite) {
        result = { version: 1, actionId: id, status: claim.dispatch ? 'failed' : 'unknown' };
        reason = 'request_rejected';
      } else {
        result = { version: 1, actionId: id, status: claim.dispatch ? 'pending' : 'unknown' };
        reason = 'remote_unknown';
      }
    }
    await deps.outcome(context, { actionId: id, reason });
    await deps.actions.settle(context, id, claim.leaseToken, result);
    return result;
  }
  return { provider: 'github', performAction: execute, queryAction, findRemote: query };
}
