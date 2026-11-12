import { z } from 'zod';
import { scopeSchema, type OperationContext, type Scope, type DataReference } from '@fasrun/contracts-core';
import { evaluateConditionExpression, validateConditionExpression, type ConditionContext } from './conditions/index.js';
import type { AuditEvent, PolicySnapshot } from './control-plane.js';

export const effectivePolicyConstraintsSchema = z.strictObject({
  condition: z
    .json()
    .refine((value) => validateConditionExpression(value).valid)
    .optional(),
  budgets: z.array(
    z.strictObject({
      scope: z.enum(['organization', 'team', 'project', 'member']),
      scopeId: z.string().min(1),
      remaining: z.number().finite().nonnegative(),
      hardLimit: z.number().finite().nonnegative(),
    }),
  ),
  allowedReadScopes: z.array(scopeSchema),
  excludedChannels: z.array(z.string().min(1)),
});
export type EffectivePolicyConstraints = z.infer<typeof effectivePolicyConstraintsSchema>;
export interface AuditRecord {
  event: AuditEvent;
  sequence: number;
  previousHash: string;
  hash: string;
}
export interface AuditCheckpoint {
  orgId: string;
  sequence: number;
  hash: string;
}
export interface PolicyDecision {
  allowed: boolean;
  reasons: string[];
  estimatedCost: number;
  policyVersion: string;
}
export interface PolicyEvaluation {
  context: OperationContext;
  facts: ConditionContext;
  estimatedUnitCost: number;
  retryLimit: number;
  references: DataReference[];
  channel: string;
}
/** Containment is asymmetric: an org grant includes its teams; a team grant does not include the org. */
export function scopeContains(grant: Scope, requested: Scope): boolean {
  return (
    grant.orgId === requested.orgId &&
    (grant.teamId === undefined || grant.teamId === requested.teamId) &&
    (grant.projectId === undefined || grant.projectId === requested.projectId)
  );
}
/** Subscription eligibility comes from a trusted environment selection adapter, never from agent JSON. */
export function evaluatePolicy(
  snapshot: PolicySnapshot,
  input: PolicyEvaluation,
  personalSubscription = false,
): PolicyDecision {
  const reasons: string[] = [];
  const constraints = effectivePolicyConstraintsSchema.safeParse(snapshot.constraints);
  const { context } = input;
  const estimateValid =
    Number.isFinite(input.estimatedUnitCost) &&
    input.estimatedUnitCost >= 0 &&
    Number.isSafeInteger(input.retryLimit) &&
    input.retryLimit >= 0;
  const estimatedCost = personalSubscription ? 0 : input.estimatedUnitCost * (1 + input.retryLimit);
  if (!estimateValid || !Number.isFinite(estimatedCost)) reasons.push('invalid-cost-estimate');
  if (snapshot.orgId !== context.actor.orgId || snapshot.orgId !== context.scope.orgId)
    reasons.push('organization-mismatch');
  if (!constraints.success) reasons.push('invalid-policy');
  else {
    const policy = constraints.data;
    if (policy.condition !== undefined) {
      const result = evaluateConditionExpression(policy.condition, input.facts);
      if (!result.valid) reasons.push('invalid-condition-context');
      else if (!result.matched) reasons.push('condition-not-matched');
    }
    if (!policy.allowedReadScopes.some((scope) => scopeContains(scope, context.scope))) reasons.push('scope-denied');
    if (policy.excludedChannels.includes(input.channel)) reasons.push('channel-excluded');
    for (const ref of input.references) {
      if (
        ref.orgId !== context.actor.orgId ||
        !ref.labels.readScopes.some((scope) => scopeContains(scope, context.scope))
      )
        reasons.push('reference-scope-denied');
      if (ref.labels.excludedChannels.includes(input.channel)) reasons.push('reference-channel-excluded');
    }
    for (const budget of policy.budgets) {
      const subject =
        budget.scope === 'organization'
          ? context.scope.orgId
          : budget.scope === 'team'
            ? context.scope.teamId
            : budget.scope === 'project'
              ? context.scope.projectId
              : context.actor.actorId;
      if (subject === budget.scopeId && (estimatedCost > budget.remaining || estimatedCost > budget.hardLimit))
        reasons.push(`budget-${budget.scope}-exceeded`);
    }
  }
  return {
    allowed: reasons.length === 0,
    reasons: [...new Set(reasons)],
    estimatedCost: Number.isFinite(estimatedCost) ? estimatedCost : 0,
    policyVersion: snapshot.policyVersion,
  };
}
