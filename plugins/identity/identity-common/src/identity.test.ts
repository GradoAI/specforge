import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ROLES,
  PERMISSIONS,
  defaultRules,
  decidePermission,
  classifyAdmission,
  validateRoleAssignment,
  type Member,
  type ObjectFacts,
  type RoleAssignment,
} from './identity.js';
// Independent approved 2.17 matrix fixture; never derived from PERMISSIONS at test runtime.
const expectedMatrix = JSON.parse(
  readFileSync(new URL('./fixtures/matrix-v1.json', import.meta.url), 'utf8'),
) as Record<string, string[]>;
const member: Member = {
  id: 'member',
  orgId: 'org',
  active: true,
  issuer: 'issuer',
  subject: 'subject',
  sessionVersion: 1,
  teamIds: ['team'],
  groupIds: ['group'],
};
const context = {
  actor: {
    version: 1 as const,
    actorId: 'member',
    actorKind: 'member' as const,
    orgId: 'org',
    clientId: 'client',
    source: 'http' as const,
    traceId: 'trace',
  },
  permission: 'work.create',
  scope: { orgId: 'org', teamId: 'team', projectId: 'project' },
  object: { type: 'work', id: 'work' },
};
const facts: ObjectFacts = {
  conditions: {},
  triggerId: 'other',
  proposerId: 'other',
  applicantId: 'other',
  machineOwnerId: 'member',
  requirementsReviewerIds: [],
  allowRequirementsTrigger: false,
  allowMergeRequirementsReviewer: false,
  independentReviewerIds: ['independent'],
  constraints: Object.fromEntries(Object.keys(PERMISSIONS).map((p) => [p, true])),
};
const roles = (role: RoleAssignment['role']): RoleAssignment[] => [
  { id: 'grant', memberId: 'member', role, scope: { orgId: 'org' } },
];
describe('TC-SF5-IDENTITY-005 complete 14-role permission matrix', () => {
  it('checks every role/permission positive and negative pair with explicit object conditions', () => {
    expect(ROLES).toHaveLength(14);
    for (const role of ROLES)
      for (const [permission, granted] of Object.entries(expectedMatrix))
        expect(
          decidePermission({ ...context, permission }, member, roles(role), defaultRules('org'), facts).allowed,
          `${role}/${permission}`,
        ).toBe((granted as readonly string[]).includes(role));
  });
  it('TC-SF5-IDENTITY-004 inherits applicable scoped union but rejects different organization', () => {
    expect(
      decidePermission(
        context,
        member,
        [...roles('observer'), { ...roles('member')[0]!, scope: { orgId: 'org', teamId: 'team' } }],
        defaultRules('org'),
        facts,
      ).allowed,
    ).toBe(true);
    expect(
      decidePermission({ ...context, scope: { orgId: 'other' } }, member, roles('member'), defaultRules('org'), facts)
        .allowed,
    ).toBe(false);
    expect(
      decidePermission(context, { ...member, active: false }, roles('member'), defaultRules('org'), facts).allowed,
    ).toBe(false);
    expect(
      decidePermission({ ...context, permission: 'unknown' }, member, roles('member'), defaultRules('org'), facts)
        .reason,
    ).toBe('unknown-permission');
    expect(
      decidePermission(
        context,
        member,
        [{ ...roles('member')[0]!, scope: { orgId: 'org', teamId: 'other' } }],
        defaultRules('org'),
        facts,
      ).allowed,
    ).toBe(false);
  });
  it('TC-SF5-IDENTITY-006 enforces duties even when rules have empty conditions', () => {
    for (const permission of [
      'spec.approve_requirements',
      'spec.approve_design',
      'pr.review',
      'pr.merge',
      'ci.release',
      'policy.confirm',
      'plugin.security_review',
    ])
      expect(
        decidePermission(
          {
            ...context,
            permission,
            actor: {
              ...context.actor,
              actorKind: 'agent',
              actorId: 'independent-agent',
              authorizationId: 'authorization',
            },
          },
          member,
          ROLES.flatMap(roles),
          defaultRules('org'),
          {
            ...facts,
            agentBinding: { agentId: 'independent-agent', memberId: member.id, authorizationId: 'authorization' },
            agentPermissions: Object.keys(PERMISSIONS),
            projectPermissions: Object.keys(PERMISSIONS),
            environmentPermissions: Object.keys(PERMISSIONS),
          },
        ).reason,
      ).toBe('human-approval-required');
    for (const permission of ['pr.review', 'pr.merge', 'ci.release'])
      expect(
        decidePermission({ ...context, permission }, member, ROLES.flatMap(roles), defaultRules('org'), {
          ...facts,
          triggerId: 'member',
        }).allowed,
      ).toBe(false);
    expect(
      decidePermission(
        { ...context, permission: 'spec.approve_requirements' },
        member,
        roles('requirements_reviewer'),
        defaultRules('org'),
        { ...facts, triggerId: 'member' },
      ).allowed,
    ).toBe(false);
    expect(
      decidePermission(
        { ...context, permission: 'spec.approve_requirements' },
        member,
        roles('requirements_reviewer'),
        defaultRules('org'),
        { ...facts, triggerId: 'member', allowRequirementsTrigger: true },
      ).allowed,
    ).toBe(true);
    expect(
      decidePermission(
        { ...context, permission: 'spec.approve_design' },
        member,
        roles('design_reviewer'),
        defaultRules('org'),
        { ...facts, triggerId: 'member', independentReviewerIds: [] },
      ).allowed,
    ).toBe(false);
    expect(
      decidePermission({ ...context, permission: 'pr.merge' }, member, roles('merge_approver'), defaultRules('org'), {
        ...facts,
        requirementsReviewerIds: ['member'],
      }).allowed,
    ).toBe(false);
    for (const [permission, change] of [
      ['policy.confirm', { proposerId: 'member' }],
      ['plugin.security_review', { applicantId: 'member' }],
      ['machine.own', { machineOwnerId: 'other' }],
    ] as const)
      expect(
        decidePermission({ ...context, permission }, member, ROLES.flatMap(roles), defaultRules('org'), {
          ...facts,
          ...change,
        }).allowed,
      ).toBe(false);
    expect(() => validateRoleAssignment(roles('platform_admin'), roles('platform_auditor')[0]!)).toThrow();
    expect(() => validateRoleAssignment(roles('platform_auditor'), roles('platform_admin')[0]!)).toThrow();
    expect(() => validateRoleAssignment([], roles('member')[0]!)).not.toThrow();
  });
  it('uses dynamic domains, detects corrupt rules, and intersects agent grants', () => {
    expect(
      decidePermission({ ...context, permission: 'work.answer' }, member, [], defaultRules('org'), {
        ...facts,
        triggerId: 'member',
      }).allowed,
    ).toBe(true);
    const invalid = { ...defaultRules('org')[0]!, condition: { must: [{ condition: 'unknown', params: {} }] } };
    expect(decidePermission(context, member, roles('member'), [...defaultRules('org'), invalid], facts).reason).toBe(
      'invalid-permission-rule',
    );
    expect(
      decidePermission(
        { ...context, permission: 'budget.manage' },
        member,
        roles('budget_admin'),
        defaultRules('org'),
        { ...facts, constraints: {} },
      ).allowed,
    ).toBe(false);
    const agent = {
      ...context,
      actor: {
        ...context.actor,
        actorId: 'agent-unique',
        actorKind: 'agent' as const,
        authorizationId: 'authorization-1',
      },
    };
    expect(decidePermission(agent, member, roles('member'), defaultRules('org'), facts).allowed).toBe(false);
    expect(
      decidePermission(agent, member, roles('member'), defaultRules('org'), {
        ...facts,
        agentBinding: { agentId: 'agent-unique', memberId: 'member', authorizationId: 'authorization-1' },
        agentPermissions: ['work.create'],
        projectPermissions: ['work.create'],
        environmentPermissions: ['work.create'],
      }).allowed,
    ).toBe(true);
  });
  it('TC-SF5-IDENTITY-009/010 separates explicit requests from bots and approved candidates', () => {
    const base = {
      sourceTrusted: true,
      senderIsBot: false,
      mode: 'off' as const,
      explicitRequest: true,
      ruleApproved: false,
      ruleId: '',
      ruleVersion: '',
      assessmentPassed: false,
      assessmentEvidence: '',
    };
    expect(classifyAdmission(base)).toBe('explicit');
    expect(classifyAdmission({ ...base, sourceTrusted: false })).toBe('reject');
    expect(classifyAdmission({ ...base, senderIsBot: true })).toBe('reject');
    expect(classifyAdmission({ ...base, explicitRequest: false, mode: 'observe' })).toBe('observe');
    expect(classifyAdmission({ ...base, explicitRequest: false, mode: 'auto' })).toBe('reject');
    expect(
      classifyAdmission({
        ...base,
        senderIsBot: true,
        mode: 'auto',
        ruleApproved: true,
        ruleId: 'rule',
        ruleVersion: 'v1',
        assessmentPassed: true,
        assessmentEvidence: 'human-approved-basis',
      }),
    ).toBe('proactive');
  });
});

it('TC-SF5-IDENTITY-006 requires trigger facts before either specification approval', () => {
  for (const [permission, role] of [
    ['spec.approve_requirements', 'requirements_reviewer'],
    ['spec.approve_design', 'design_reviewer'],
  ] as const) {
    expect(
      decidePermission({ ...context, permission }, member, roles(role), defaultRules('org'), {
        ...facts,
        triggerId: null,
      }).reason,
    ).toBe('missing-trigger-relation');
  }
});
