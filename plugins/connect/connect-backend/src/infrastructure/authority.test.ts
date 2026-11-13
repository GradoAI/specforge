import { it, expect } from 'vitest';
import { decidePermission, defaultRules, type Member, type RoleAssignment } from '@fasrun/plugin-identity-common';
import type { OperationContext } from '@fasrun/contracts-core';
import { createConnectAuthority, createManagedContextResolver } from './authority.js';
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: 'manager',
    actorKind: 'member',
    orgId: 'org',
    clientId: 'gateway',
    source: 'internal',
    traceId: 'trace',
  },
  scope: { orgId: 'org', projectId: 'project', teamId: 'team' },
  object: { type: 'repository', id: 'repo' },
  permission: 'connect.inbox.accept',
};
const member: Member = {
  id: 'manager',
  orgId: 'org',
  active: true,
  issuer: 'issuer',
  subject: 'subject',
  sessionVersion: 1,
  teamIds: ['team'],
  groupIds: [],
};
it('TC-SF5-CONNECT-002 uses existing identity matrix and current configured actor, never a service/admin flag', async () => {
  let role: RoleAssignment['role'] = 'platform_admin',
    active = true,
    revoked = false;
  const identity = {
    authorize: (actual: OperationContext) =>
      Promise.resolve(
        decidePermission(
          actual,
          { ...member, active },
          revoked ? [] : [{ id: 'grant', memberId: 'manager', scope: { orgId: 'org' }, role }],
          defaultRules('org'),
          {
            conditions: {},
            triggerId: 'external',
            proposerId: 'external',
            applicantId: 'external',
            machineOwnerId: 'manager',
            requirementsReviewerIds: [],
            allowRequirementsTrigger: false,
            allowMergeRequirementsReviewer: false,
            independentReviewerIds: [],
            constraints: { 'integration.manage': !revoked },
          },
        ),
      ),
  };
  const authority = createConnectAuthority(identity);
  expect(await authority.authorize(context)).toBe(true);
  role = 'member';
  expect(await authority.authorize(context)).toBe(false);
  role = 'platform_admin';
  active = false;
  expect(await authority.authorize(context)).toBe(false);
  active = true;
  revoked = true;
  expect(await authority.authorize(context)).toBe(false);
  revoked = false;
  const denials: string[] = [];
  const resolve = createManagedContextResolver({
    audit: {
      audit: (event) => {
        denials.push(event.action);
        return Promise.resolve({ eventId: event.eventId, sequence: 1, hash: 'a'.repeat(64) });
      },
    },
    identity,
    binding: (peer, target) =>
      peer === 'gateway.test' && target.id === 'repo'
        ? Promise.resolve(context)
        : Promise.reject(new Error('Not configured')),
  });
  const target = { operation: 'accept' as const, id: 'repo', installationId: 'installation' };
  expect((await resolve('gateway.test', context, target)).actor).toMatchObject({
    actorId: 'manager',
    clientId: 'gateway.test',
    source: 'internal',
  });
  await expect(resolve('wrong.test', context, target)).rejects.toThrow();
  await expect(
    resolve('gateway.test', { ...context, actor: { ...context.actor, actorId: 'another-admin' } }, target),
  ).rejects.toThrow();
  await expect(resolve('gateway.test', context, { ...target, id: 'another-repo' })).rejects.toThrow();
  expect(denials).toContain('connect.internal.denied');
  revoked = true;
  await expect(resolve('gateway.test', context, target)).rejects.toThrow();
});
