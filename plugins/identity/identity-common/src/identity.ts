import roleCatalog from './roles.json' with { type: 'json' };
import { z } from 'zod';
import { scopeSchema, type ActorContext, type OperationContext } from '@fasrun/contracts-core';
import {
  validateConditionExpression,
  evaluateConditionExpression,
  scopeContains,
  type ConditionContext,
  type ConditionExpression,
} from '@fasrun/plugin-governance-common';
import type { Decision } from './control-plane.js';
export type Role = keyof typeof roleCatalog;
export const ROLES: readonly Role[] = Object.keys(roleCatalog) as Role[];
export const PERMISSIONS = {
  'work.view': [
    'organization_admin',
    'budget_admin',
    'security_admin',
    'environment_admin',
    'operations',
    'team_lead',
    'member',
    'observer',
    'requirements_reviewer',
    'design_reviewer',
    'merge_approver',
    'machine_owner',
  ],
  'work.create': ['member', 'team_lead'],
  'work.answer': ['team_lead'],
  'work.intervene': ['team_lead'],
  'work.transfer': ['team_lead'],
  'spec.approve_requirements': ['requirements_reviewer'],
  'spec.approve_design': ['design_reviewer'],
  'pr.review': ['design_reviewer', 'member'],
  'pr.merge': ['merge_approver'],
  'ci.release': ['team_lead', 'design_reviewer'],
  'budget.release': ['team_lead', 'budget_admin'],
  'machine.own': ['machine_owner'],
  'knowledge.edit': ['team_lead', 'organization_admin'],
  'repo.settings': ['team_lead'],
  'automation.manage': ['team_lead', 'organization_admin'],
  'merge.auto_rule': ['team_lead', 'organization_admin'],
  'insight.usage_view': ['organization_admin', 'team_lead', 'member'],
  'telemetry.manage': ['platform_admin'],
  'platform.upgrade': ['platform_admin'],
  'platform.backup_view': ['platform_admin', 'operations'],
  'schedule.dispatch': ['team_lead', 'operations'],
  'observe.view': ['operations', 'team_lead', 'platform_auditor'],
  'member.manage': ['organization_admin'],
  'budget.manage': ['budget_admin'],
  'policy.propose': ['organization_admin', 'security_admin'],
  'policy.confirm': ['security_admin'],
  'env_template.manage': ['environment_admin'],
  'plugin.request': ['team_lead', 'organization_admin'],
  'plugin.security_review': ['security_admin'],
  'plugin.approve': ['organization_admin'],
  'integration.manage': ['platform_admin'],
  'org.provision': ['platform_admin'],
  'service_account.manage': ['organization_admin'],
  'audit.view': ['platform_auditor', 'organization_admin', 'security_admin'],
} as const satisfies Record<string, readonly Role[]>;
export type BuiltinPermission = keyof typeof PERMISSIONS;
export const APPROVAL_PERMISSIONS = [
  'spec.approve_requirements',
  'spec.approve_design',
  'pr.review',
  'pr.merge',
  'ci.release',
  'budget.release',
  'policy.confirm',
  'plugin.security_review',
  'plugin.approve',
  'platform.upgrade',
  'merge.auto_rule',
] as const;
export const memberSchema = z.strictObject({
  id: z.string().min(1),
  orgId: z.string().min(1),
  active: z.boolean(),
  issuer: z.url(),
  subject: z.string().min(1),
  sessionVersion: z.number().int().positive(),
  teamIds: z.array(z.string()),
  groupIds: z.array(z.string()),
});
export type Member = z.infer<typeof memberSchema>;
export const roleAssignmentSchema = z.strictObject({
  id: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(ROLES),
  scope: scopeSchema,
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export const permissionRuleSchema = z
  .strictObject({
    id: z.string().min(1),
    scope: scopeSchema,
    permission: z.enum(Object.keys(PERMISSIONS) as [BuiltinPermission, ...BuiltinPermission[]]),
    domain: z.strictObject({
      kind: z.enum([
        'member',
        'team',
        'group',
        'role',
        'trigger',
        'requirements_reviewer',
        'design_reviewer',
        'independent_reviewer',
        'machine_owner',
        'subscriber',
      ]),
      id: z.string().optional(),
    }),
    condition: z.json().refine((value) => validateConditionExpression(value).valid),
    policyVersion: z.string().min(1),
    isCustomized: z.boolean(),
  })
  .refine(
    (rule) =>
      ['member', 'team', 'group', 'role'].includes(rule.domain.kind)
        ? typeof rule.domain.id === 'string' && rule.domain.id.length > 0
        : rule.domain.id === undefined,
    { message: 'Static domains require an id; dynamic domains are object-resolved' },
  );
export type PermissionRule = z.infer<typeof permissionRuleSchema>;
export interface ObjectFacts {
  agentBinding?: { agentId: string; memberId: string; authorizationId: string };
  conditions: ConditionContext;
  triggerId: string | null;
  proposerId: string | null;
  applicantId: string | null;
  machineOwnerId: string | null;
  requirementsReviewerIds: string[];
  allowRequirementsTrigger: boolean;
  allowMergeRequirementsReviewer: boolean;
  independentReviewerIds: string[];
  constraints: Partial<Record<BuiltinPermission, boolean>>;
  agentPermissions?: string[];
  projectPermissions?: string[];
  environmentPermissions?: string[];
}
export interface EffectivePermission {
  permission: BuiltinPermission;
  ruleIds: string[];
  conditions: ConditionExpression[];
  evaluated: false;
}
export function defaultRules(orgId: string): PermissionRule[] {
  const rules: PermissionRule[] = [];
  for (const [permission, roles] of Object.entries(PERMISSIONS))
    for (const role of roles)
      rules.push({
        id: `builtin.${permission}.${role}`,
        scope: { orgId },
        permission: permission as BuiltinPermission,
        domain: { kind: 'role', id: role },
        condition: { must: [] },
        policyVersion: 'identity-defaults-v1',
        isCustomized: false,
      });
  for (const permission of ['work.answer', 'work.intervene'] as const)
    rules.push({
      id: `builtin.${permission}.trigger`,
      scope: { orgId },
      permission,
      domain: { kind: 'trigger' },
      condition: { must: [] },
      policyVersion: 'identity-defaults-v1',
      isCustomized: false,
    });
  return rules;
}
export function validateRoleAssignment(existing: readonly RoleAssignment[], next: RoleAssignment): void {
  if (
    (next.role === 'platform_admin' &&
      existing.some((x) => x.memberId === next.memberId && x.role === 'platform_auditor')) ||
    (next.role === 'platform_auditor' &&
      existing.some((x) => x.memberId === next.memberId && x.role === 'platform_admin'))
  )
    throw new Error('Incompatible platform duties');
}
export function decidePermission(
  context: OperationContext,
  member: Member,
  assignments: readonly RoleAssignment[],
  rules: readonly PermissionRule[],
  facts: ObjectFacts,
): Decision {
  const deny = (reason: string): Decision => ({
    allowed: false,
    matchedRuleIds: [],
    policyVersion:
      rules
        .map((x) => x.policyVersion)
        .sort()
        .join('|') || 'none',
    reason,
  });
  if (
    !member.active ||
    context.actor.orgId !== member.orgId ||
    context.scope.orgId !== member.orgId ||
    (context.actor.actorKind === 'agent'
      ? !facts.agentBinding ||
        facts.agentBinding.agentId !== context.actor.actorId ||
        facts.agentBinding.memberId !== member.id ||
        context.actor.actorId === member.id ||
        facts.agentBinding.authorizationId !== context.actor.authorizationId
      : context.actor.actorId !== member.id)
  )
    return deny('inactive-or-cross-organization');
  if (rules.some((rule) => !permissionRuleSchema.safeParse(rule).success)) return deny('invalid-permission-rule');
  if (!Object.hasOwn(PERMISSIONS, context.permission)) return deny('unknown-permission');
  const permission = context.permission as BuiltinPermission;
  if (context.actor.actorKind !== 'member' && (APPROVAL_PERMISSIONS as readonly string[]).includes(permission))
    return deny('human-approval-required');
  if (
    context.actor.actorKind === 'agent' &&
    (!facts.agentPermissions?.includes(permission) ||
      !facts.projectPermissions?.includes(permission) ||
      !facts.environmentPermissions?.includes(permission))
  )
    return deny('agent-intersection-denied');
  if (
    ['pr.review', 'pr.merge', 'ci.release'].includes(permission) &&
    (!facts.triggerId || facts.triggerId === member.id)
  )
    return deny('independent-actor-required');
  if (['spec.approve_design', 'spec.approve_requirements'].includes(permission) && !facts.triggerId)
    return deny('missing-trigger-relation');
  if (
    permission === 'spec.approve_design' &&
    facts.triggerId === member.id &&
    !facts.independentReviewerIds.some((id) => id !== member.id)
  )
    return deny('design-trigger-conflict');
  if (
    permission === 'spec.approve_requirements' &&
    facts.triggerId === member.id &&
    (!facts.allowRequirementsTrigger || !facts.independentReviewerIds.some((id) => id !== member.id))
  )
    return deny('requirements-trigger-conflict');
  if (
    permission === 'pr.merge' &&
    facts.requirementsReviewerIds.includes(member.id) &&
    !facts.allowMergeRequirementsReviewer
  )
    return deny('merge-reviewer-conflict');
  if (permission === 'policy.confirm' && (!facts.proposerId || facts.proposerId === member.id))
    return deny('proposer-conflict');
  if (permission === 'plugin.security_review' && (!facts.applicantId || facts.applicantId === member.id))
    return deny('applicant-conflict');
  if (permission === 'machine.own' && facts.machineOwnerId !== member.id) return deny('not-machine-owner');
  // Non-identity product predicates (limits, protocol registrations, observation evidence) are resolved by trusted owning adapters.
  if (
    [
      'repo.settings',
      'automation.manage',
      'merge.auto_rule',
      'telemetry.manage',
      'platform.upgrade',
      'budget.manage',
      'plugin.approve',
      'insight.usage_view',
    ].includes(permission) &&
    facts.constraints[permission] !== true
  )
    return deny('required-object-constraint');
  const roles = assignments
    .filter((x) => x.memberId === member.id && scopeContains(x.scope, context.scope))
    .map((x) => x.role);
  const matched: string[] = [];
  for (const rule of rules) {
    if (rule.permission !== permission || !scopeContains(rule.scope, context.scope)) continue;
    const domain = {
      condition: 'subject_in_domain',
      params:
        rule.domain.id === undefined ? { domain: rule.domain.kind } : { domain: rule.domain.kind, id: rule.domain.id },
    };
    const conditions: ConditionContext = {
      ...facts.conditions,
      subject: { id: member.id, teamIds: member.teamIds, groupIds: member.groupIds, roles },
      relations: { trigger: facts.triggerId, proposer: facts.proposerId, applicant: facts.applicantId },
      domains: {
        ...facts.conditions.domains,
        trigger: facts.triggerId ? [facts.triggerId] : [],
        machine_owner: facts.machineOwnerId ? [facts.machineOwnerId] : [],
        requirements_reviewer: facts.requirementsReviewerIds,
        independent_reviewer: facts.independentReviewerIds,
      },
    };
    const applies = evaluateConditionExpression({ must: [domain] }, conditions),
      extra = evaluateConditionExpression(rule.condition, conditions);
    if (applies.valid && applies.matched && extra.valid && extra.matched) matched.push(rule.id);
  }
  return {
    ...deny(matched.length ? 'allowed' : 'no-matching-rule'),
    allowed: matched.length > 0,
    matchedRuleIds: matched,
  };
}
export interface AdmissionFacts {
  sourceTrusted: boolean;
  senderIsBot: boolean;
  mode: 'off' | 'observe' | 'auto';
  explicitRequest: boolean;
  ruleApproved: boolean;
  ruleId: string;
  ruleVersion: string;
  assessmentPassed: boolean;
  assessmentEvidence: string;
}
export function classifyAdmission(facts: AdmissionFacts): 'explicit' | 'proactive' | 'observe' | 'reject' {
  if (!facts.sourceTrusted) return 'reject';
  if (facts.explicitRequest && !facts.senderIsBot) return 'explicit';
  if (facts.mode === 'off') return 'reject';
  if (facts.mode === 'observe') return 'observe';
  return facts.ruleApproved &&
    facts.ruleId.length > 0 &&
    facts.ruleVersion.length > 0 &&
    facts.assessmentPassed &&
    facts.assessmentEvidence.length > 0
    ? 'proactive'
    : 'reject';
}
export type IdentityRequest = { clientId: string; source: ActorContext['source']; traceId: string; orgId: string };
