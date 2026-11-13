import { expect, it } from 'vitest';
import { newId, type OperationContext } from '@fasrun/contracts-core';
import { decidePermission, defaultRules, type Member, type ObjectFacts } from '@fasrun/plugin-identity-common';
import { createDataService } from './service.js';
import { dataFixture } from './test-fixture.js';

const { fixture: f, request } = dataFixture();
it('TC-CF-015 independent reviewer uses current identity matrix without work.create or a borrowed work authorization', async () => {
  const original = await f.service!.register(f.context, request());
  const reviewer: OperationContext = structuredClone(f.context);
  reviewer.actor.actorId = newId('mem');
  delete reviewer.actor.authorizationId;
  const member: Member = {
    id: reviewer.actor.actorId,
    orgId: reviewer.actor.orgId,
    active: true,
    issuer: 'controlled-identity-port',
    subject: 'independent-reviewer',
    sessionVersion: 1,
    teamIds: [],
    groupIds: [],
  };
  const facts: ObjectFacts = {
    conditions: {},
    triggerId: f.context.actor.actorId,
    proposerId: f.context.actor.actorId,
    applicantId: f.context.actor.actorId,
    machineOwnerId: null,
    requirementsReviewerIds: [],
    allowRequirementsTrigger: false,
    allowMergeRequirementsReviewer: false,
    independentReviewerIds: [member.id],
    constraints: { 'work.view': true, 'spec.approve_requirements': true },
  };
  const calls: OperationContext[] = [];
  // Real shipped role/condition evaluator. The persisted authorization lookup remains an explicit
  // controlled owner port: unknown/borrowed/revoked grants deny, never become reviewer credentials.
  const grants = new Map([
    [f.context.actor.authorizationId!, { memberId: f.context.actor.actorId, revoked: false }],
    ['revoked-reviewer-grant', { memberId: member.id, revoked: true }],
  ]);
  const authorize = (context: OperationContext) => {
    calls.push(structuredClone(context));
    const result = decidePermission(
      context,
      member,
      [{ id: 'review-role', memberId: member.id, role: 'requirements_reviewer', scope: reviewer.scope }],
      defaultRules(member.orgId),
      facts,
    );
    const grant = context.actor.authorizationId ? grants.get(context.actor.authorizationId) : undefined;
    if (context.actor.authorizationId && (!grant || grant.revoked || grant.memberId !== member.id))
      result.allowed = false;
    return Promise.resolve(result);
  };
  const service = createDataService({ ...f.deps!, authorize });
  expect((await service.read({ context: reviewer, ref: original })).ref.id).toBe(original.id);
  const confirmed = await service.confirm(reviewer, original, 'reviewed-head');
  expect(confirmed.labels.confirmation).toMatchObject({ kind: 'human', memberId: member.id });
  expect(calls.some((call) => call.permission === 'spec.approve_requirements')).toBe(true);
  expect(calls.every((call) => call.actor.authorizationId === undefined)).toBe(true);
  await expect(service.register(reviewer, request())).rejects.toThrow('denied');
  for (const authorizationId of [f.context.actor.authorizationId!, 'revoked-reviewer-grant', 'unknown-grant']) {
    await expect(
      service.confirm({ ...reviewer, actor: { ...reviewer.actor, authorizationId } }, original, 'reviewed-head'),
    ).rejects.toThrow('denied');
    expect(calls.at(-1)?.actor.authorizationId).toBe(authorizationId);
  }
  member.active = false;
  await expect(service.read({ context: reviewer, ref: original })).rejects.toThrow('denied');
  const count = calls.length;
  await expect(
    service.read({ context: { ...reviewer, actor: { ...reviewer.actor, actorKind: 'agent' } }, ref: original }),
  ).rejects.toThrow('denied');
  expect(calls).toHaveLength(count);
});
