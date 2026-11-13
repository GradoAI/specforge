import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  newId,
  jsonValueSchema,
  operationContextSchema,
  type ActorContext,
  type OperationContext,
} from '@fasrun/contracts-core';
import {
  defaultRules,
  decidePermission,
  classifyAdmission,
  validateRoleAssignment,
  permissionRuleSchema,
  memberSchema,
  roleAssignmentSchema,
  type Member,
  type IdentityRequest,
  type ObjectFacts,
  type AdmissionFacts,
  type RoleAssignment,
  type PermissionRule,
  type Authorization,
  type Decision,
  type EffectivePermission,
} from '@fasrun/plugin-identity-common';
import { scopeContains } from '@fasrun/plugin-governance-common';
import type {
  IdentityRepository,
  OidcProvider,
  IdentityAudit,
  ExternalAccount,
  IdentityTransaction,
} from '../common/ports.js';
export interface IdentityDependencies {
  /** Trusted internal agent invocation binding; never accepts a caller supplied represented member. M2 supplies its signed-node adapter. */
  agentIdentity?: (actor: ActorContext) => Promise<
    | {
        agentId: string;
        memberId: string;
        authorizationId: string;
        projectPermissions: string[];
        environmentPermissions: string[];
      }
    | undefined
  >;
  repository: IdentityRepository;
  provider: OidcProvider;
  audit: IdentityAudit;
  origin: string;
  clock: () => Date;
  facts: (context: OperationContext) => Promise<ObjectFacts>;
  admission: (context: OperationContext, intakeId: string) => Promise<AdmissionFacts>;
  policyVersion: (context: OperationContext) => Promise<string>;
  policyAllows: (context: OperationContext) => Promise<boolean>;
}
export class IdentityDeniedError extends Error {
  constructor() {
    super('Identity operation denied');
  }
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createIdentityService(deps: IdentityDependencies) {
  const repo = deps.repository;
  const actorFor = (member: Member, request: IdentityRequest): ActorContext => ({
    version: 1,
    actorId: member.id,
    actorKind: 'member',
    orgId: member.orgId,
    clientId: request.clientId,
    source: request.source,
    traceId: request.traceId,
  });
  const contextFor = (actor: ActorContext): OperationContext => ({
    actor,
    scope: { orgId: actor.orgId },
    permission: 'work.view',
    object: { type: 'member', id: actor.actorId },
  });
  async function binding(actor: ActorContext) {
    if (actor.actorKind !== 'agent') return undefined;
    const result = await deps.agentIdentity?.(actor);
    if (
      !result ||
      result.agentId !== actor.actorId ||
      result.memberId === actor.actorId ||
      result.authorizationId !== actor.authorizationId
    )
      throw new IdentityDeniedError();
    return result;
  }
  async function trustedFacts(context: OperationContext): Promise<ObjectFacts> {
    const facts = await deps.facts(context),
      agent = await binding(context.actor);
    return agent
      ? {
          ...facts,
          agentBinding: agent,
          projectPermissions: agent.projectPermissions,
          environmentPermissions: agent.environmentPermissions,
        }
      : facts;
  }
  async function current(context: OperationContext) {
    operationContextSchema.parse(context);
    const agent = await binding(context.actor);
    const member = await repo.transaction(context.actor.orgId, context.actor.actorId, async (s) => {
      if (agent) {
        const authorization = await s.authorization(agent.authorizationId);
        if (
          !authorization ||
          authorization.revoked ||
          authorization.snapshot.actor.actorId !== agent.memberId ||
          !scopeContains(authorization.snapshot.scope, context.scope)
        )
          throw new IdentityDeniedError();
      }
      return s.member(agent?.memberId ?? context.actor.actorId);
    });
    if (!member?.active) {
      throw new IdentityDeniedError();
    }
    return member;
  }
  async function record(
    context: OperationContext,
    action: string,
    outcome: 'allowed' | 'denied',
    details: Record<string, string> = {},
  ) {
    await deps.audit.record(context, action, outcome, details);
  }
  async function decideInTransaction(
    s: IdentityTransaction,
    context: OperationContext,
    facts: ObjectFacts,
  ): Promise<Decision> {
    const member = await s.member(
      context.actor.actorKind === 'agent' ? (facts.agentBinding?.memberId ?? '') : context.actor.actorId,
    );
    if (!member?.active) throw new IdentityDeniedError();
    const roles = await s.roles(member.id),
      custom = await s.rules(),
      defaults = defaultRules(member.orgId),
      rules = [...defaults.filter((r) => !custom.some((x) => x.id === r.id)), ...custom];
    const scopes = await s.projectScopes(member.id);
    const authorization = context.actor.authorizationId
      ? await s.authorization(context.actor.authorizationId)
      : undefined;
    if (context.actor.actorKind === 'agent') facts = { ...facts, agentPermissions: authorization?.permissions ?? [] };
    let decision = decidePermission(context, member, roles, rules, facts);
    if (scopes.length && !scopes.some((scope) => scopeContains(scope, context.scope)))
      decision = { ...decision, allowed: false, reason: 'project-scope-denied' };
    if (context.actor.authorizationId) {
      if (
        !authorization ||
        authorization.revoked ||
        authorization.snapshot.actor.actorId !== member.id ||
        !scopeContains(authorization.snapshot.scope, context.scope) ||
        !authorization.permissions.includes(context.permission)
      )
        decision = { ...decision, allowed: false, reason: 'authorization-revoked-or-scope-denied' };
    }
    return decision;
  }
  async function authorize(context: OperationContext): Promise<Decision> {
    await current(context);
    const facts = await trustedFacts(context);
    const result = await repo.transaction(context.actor.orgId, context.actor.actorId, (s) =>
      decideInTransaction(s, context, facts),
    );
    if (result.allowed && !(await deps.policyAllows(context))) {
      result.allowed = false;
      result.reason = 'security-policy-denied';
    }
    if (!result.allowed)
      await record(context, 'identity.permission.denied', 'denied', {
        reason: result.reason,
        policyVersion: result.policyVersion,
        effectiveMemberId: facts.agentBinding?.memberId ?? context.actor.actorId,
      });
    return result;
  }
  async function auditOutbox(
    s: IdentityTransaction,
    context: OperationContext,
    action: string,
    details: Record<string, string> = {},
  ) {
    const event = {
      version: 1 as const,
      eventId: newId('evt'),
      actor: context.actor,
      action,
      objectType: context.object.type,
      objectId: context.object.id,
      occurredAt: deps.clock().toISOString(),
      outcome: 'allowed' as const,
      details,
    };
    await s.enqueue({
      version: 1,
      eventId: event.eventId,
      orgId: context.actor.orgId,
      topic: 'governance.audit.requested',
      payload: jsonValueSchema.parse(event),
      occurredAt: event.occurredAt,
    });
  }
  async function requirePermission(context: OperationContext, permission = context.permission) {
    const requested = { ...context, permission };
    if (!(await authorize(requested)).allowed) throw new IdentityDeniedError();
  }
  async function mutate<T>(
    context: OperationContext,
    permission: string,
    work: (s: IdentityTransaction, facts: ObjectFacts) => Promise<T>,
  ): Promise<T> {
    const requested = { ...context, permission };
    await requirePermission(requested);
    const facts = await trustedFacts(requested);
    return repo.transaction(context.actor.orgId, context.actor.actorId, async (s) => {
      if (!(await decideInTransaction(s, requested, facts)).allowed) throw new IdentityDeniedError();
      return work(s, facts);
    });
  }
  async function identify(issuer: string, subject: string, request: IdentityRequest) {
    const members = await repo.transaction(request.orgId, 'oidc', (s) => s.bySubject(issuer, subject));
    if (members.length !== 1 || !members[0]!.active) throw new IdentityDeniedError();
    const actor = actorFor(members[0]!, request);
    await record(contextFor(actor), 'identity.authenticated', 'allowed');
    return { actor, member: members[0]! };
  }
  const service = {
    authorize,
    async authenticateContext(credential: string, request: IdentityRequest) {
      try {
        const identity = await deps.provider.verify(credential);
        return (await identify(identity.issuer, identity.subject, request)).actor;
      } catch {
        await record(
          contextFor({
            version: 1,
            actorId: 'unauthenticated',
            actorKind: 'service',
            orgId: request.orgId,
            clientId: request.clientId,
            source: request.source,
            traceId: request.traceId,
          }),
          'identity.authentication.denied',
          'denied',
          { reason: 'invalid-or-inactive-identity' },
        );
        throw new IdentityDeniedError();
      }
    },
    async beginLogin(orgId: string) {
      const state = token(),
        browser = token(),
        verifier = token(),
        nonce = token();
      await repo.transaction(orgId, 'oidc', (s) =>
        s.saveChallenge({
          stateDigest: digest(state),
          browserDigest: digest(browser),
          verifier,
          nonce,
          expiresAt: new Date(deps.clock().getTime() + 300000).toISOString(),
        }),
      );
      return {
        url: deps.provider.authorizationUrl({
          state,
          nonce,
          challenge: createHash('sha256').update(verifier).digest('base64url'),
        }),
        browserCookie: `__Host-fasrun-login=${browser}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
      };
    },
    async completeLogin(input: { state: string; browserCookie: string; code: string; request: IdentityRequest }) {
      const challenge = await repo.transaction(input.request.orgId, 'oidc', (s) =>
        s.takeChallenge(digest(input.state), digest(input.browserCookie), deps.clock().toISOString()),
      );
      if (!challenge) throw new IdentityDeniedError();
      const { identity } = await deps.provider.exchange(input.code, challenge.verifier);
      if (!identity.nonce || !equal(identity.nonce, challenge.nonce)) throw new IdentityDeniedError();
      const { actor, member } = await identify(identity.issuer, identity.subject, input.request);
      const session = token(),
        csrf = token(),
        expiresAt = new Date(Math.min(identity.expiresAt * 1000, deps.clock().getTime() + 3600000)).toISOString();
      await repo.transaction(member.orgId, member.id, (s) =>
        s.saveSession({
          digest: digest(session),
          memberId: member.id,
          sessionVersion: member.sessionVersion,
          csrfDigest: digest(csrf),
          expiresAt,
          revoked: false,
        }),
      );
      return {
        actor,
        csrf,
        cookie: `__Host-fasrun-session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((Date.parse(expiresAt) - deps.clock().getTime()) / 1000))}`,
      };
    },
    async authenticateSession(
      sessionToken: string,
      request: IdentityRequest & { method: string; origin?: string; csrf?: string },
    ) {
      const found = await repo.transaction(request.orgId, 'session', async (s) => {
        const session = await s.session(digest(sessionToken));
        if (!session || session.revoked || Date.parse(session.expiresAt) <= deps.clock().getTime())
          throw new IdentityDeniedError();
        const member = await s.member(session.memberId);
        if (!member?.active || member.sessionVersion !== session.sessionVersion) throw new IdentityDeniedError();
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) &&
          (request.origin !== deps.origin || !request.csrf || !equal(digest(request.csrf), session.csrfDigest))
        )
          throw new IdentityDeniedError();
        return member;
      });
      return actorFor(found, request);
    },
    async logout(context: OperationContext, sessionToken: string) {
      await current(context);
      await repo.transaction(context.actor.orgId, context.actor.actorId, async (s) => {
        const session = await s.session(digest(sessionToken));
        if (session?.memberId !== context.actor.actorId) throw new IdentityDeniedError();
        await s.revokeSession(digest(sessionToken));
        await auditOutbox(s, context, 'identity.session.revoked');
      });
    },
    async resolveMembers(context: OperationContext, ids: string[]) {
      await requirePermission(context);
      return repo.transaction(context.actor.orgId, context.actor.actorId, async (s) => {
        const members = await Promise.all(ids.map((id) => s.member(id)));
        if (members.some((m) => !m?.active || m.orgId !== context.actor.orgId)) throw new IdentityDeniedError();
        return members.map((m) => ({ id: m!.id, orgId: m!.orgId, active: m!.active }));
      });
    },
    async effectivePermissions(context: OperationContext): Promise<EffectivePermission[]> {
      const member = await current(context);
      return repo.transaction(member.orgId, member.id, async (s) => {
        const roles = (await s.roles(member.id))
            .filter((x) => scopeContains(x.scope, context.scope))
            .map((x) => x.role),
          custom = await s.rules(),
          rules = [...defaultRules(member.orgId).filter((r) => !custom.some((x) => x.id === r.id)), ...custom];
        if (rules.some((rule) => !permissionRuleSchema.safeParse(rule).success)) throw new IdentityDeniedError();
        return rules
          .filter(
            (r) =>
              scopeContains(r.scope, context.scope) &&
              (r.domain.kind === 'role'
                ? roles.includes(r.domain.id as RoleAssignment['role'])
                : r.domain.kind === 'member'
                  ? r.domain.id === member.id
                  : r.domain.kind === 'team'
                    ? member.teamIds.includes(r.domain.id ?? '')
                    : r.domain.kind === 'group'
                      ? member.groupIds.includes(r.domain.id ?? '')
                      : true),
          )
          .map((r) => ({
            permission: r.permission,
            ruleIds: [r.id],
            conditions: [
              {
                must: [
                  {
                    condition: 'subject_in_domain',
                    params:
                      r.domain.id === undefined
                        ? { domain: r.domain.kind }
                        : { domain: r.domain.kind, id: r.domain.id },
                  },
                ],
              },
              r.condition as { must: [] },
            ],
            evaluated: false,
          }));
      });
    },
    async issueAuthorization(
      context: OperationContext,
      request: { intakeId: string; requestStrength: Authorization['requestStrength'] },
    ): Promise<Authorization> {
      if (context.actor.actorKind !== 'member') throw new IdentityDeniedError();
      await requirePermission(context, 'work.create');
      const facts = await deps.admission(context, request.intakeId);
      const mode = classifyAdmission(facts);
      if (mode === 'observe') {
        await repo.transaction(context.actor.orgId, context.actor.actorId, (s) => s.candidate(request.intakeId, facts));
        throw new IdentityDeniedError();
      }
      if (mode === 'reject' || request.requestStrength !== mode) throw new IdentityDeniedError();
      const decision = await authorize({ ...context, permission: 'work.create' }),
        version = await deps.policyVersion(context),
        effective = await service.effectivePermissions(context);
      if (!decision.allowed) throw new IdentityDeniedError();
      const finalFacts = await trustedFacts({ ...context, permission: 'work.create' });
      const authorization: Authorization = {
        version: 1,
        id: newId('aut'),
        intakeId: request.intakeId,
        actor: context.actor,
        scope: context.scope,
        requestStrength: mode,
        ruleIds: [
          ...decision.matchedRuleIds,
          ...(mode === 'proactive' ? [`${facts.ruleId}@${facts.ruleVersion}`] : []),
        ],
        policyVersion: version,
      };
      const result = await repo.transaction(context.actor.orgId, context.actor.actorId, async (s) => {
        if (!(await decideInTransaction(s, { ...context, permission: 'work.create' }, finalFacts)).allowed)
          throw new IdentityDeniedError();
        const saved = await s.issue(authorization, [...new Set(effective.map((x) => x.permission))]);
        await s.enqueue({
          version: 1,
          eventId: saved.id,
          orgId: context.actor.orgId,
          topic: 'identity.authorization.issued',
          payload: { authorizationId: saved.id, intakeId: saved.intakeId },
          occurredAt: deps.clock().toISOString(),
        });
        await auditOutbox(s, context, 'identity.authorization.issued', {
          authorizationId: saved.id,
          intakeId: saved.intakeId,
        });
        return saved;
      });
      return result;
    },
    async revoke(
      context: OperationContext,
      input: { authorizationId: string; reason: string; idempotencyKey: string },
    ) {
      const target = await repo.transaction(context.actor.orgId, context.actor.actorId, (s) =>
        s.authorization(input.authorizationId),
      );
      if (!target) throw new IdentityDeniedError();
      context = {
        ...context,
        scope: target.snapshot.scope,
        object: { type: 'authorization', id: input.authorizationId },
      };
      await requirePermission(context, 'work.intervene');
      await mutate(context, 'work.intervene', async (s) => {
        const existing = await s.authorization(input.authorizationId);
        if (!existing) throw new IdentityDeniedError();
        await s.revoke(input.authorizationId, input.reason, input.idempotencyKey);
        await auditOutbox(s, context, 'identity.authorization.revoked', { authorizationId: input.authorizationId });
        await s.enqueue({
          version: 1,
          eventId: input.idempotencyKey,
          orgId: context.actor.orgId,
          topic: 'identity.authorization.revoked',
          payload: { authorizationId: input.authorizationId },
          occurredAt: deps.clock().toISOString(),
        });
      });
    },
    async setMember(context: OperationContext, member: Member) {
      member = memberSchema.parse(member);
      context = { ...context, scope: { orgId: member.orgId }, object: { type: 'member', id: member.id } };
      await requirePermission(context, 'member.manage');
      if (member.orgId !== context.actor.orgId) throw new IdentityDeniedError();
      await mutate(context, 'member.manage', async (s) => {
        const old = await s.member(member.id);
        await s.putMember({ ...member, sessionVersion: old ? old.sessionVersion + 1 : 1 });
        await auditOutbox(s, context, 'identity.member.changed', { memberId: member.id });
      });
    },
    async assignRole(context: OperationContext, assignment: RoleAssignment) {
      assignment = roleAssignmentSchema.parse(assignment);
      context = { ...context, scope: assignment.scope, object: { type: 'member', id: assignment.memberId } };
      await requirePermission(context, assignment.role.startsWith('platform_') ? 'org.provision' : 'member.manage');
      if (assignment.scope.orgId !== context.actor.orgId) throw new IdentityDeniedError();
      await mutate(
        context,
        assignment.role.startsWith('platform_') ? 'org.provision' : 'member.manage',
        async (s, facts) => {
          if (!(await s.member(assignment.memberId))) throw new IdentityDeniedError();
          const old = await s.role(assignment.id);
          if (
            old &&
            (old.memberId !== assignment.memberId ||
              !scopeContains(assignment.scope, old.scope) ||
              !scopeContains(old.scope, assignment.scope))
          )
            throw new IdentityDeniedError();
          if (old?.role.startsWith('platform_') && !assignment.role.startsWith('platform_')) {
            const check = { ...context, permission: 'org.provision' };
            if (!(await decideInTransaction(s, check, facts)).allowed) throw new IdentityDeniedError();
          }
          validateRoleAssignment(await s.roles(assignment.memberId), assignment);
          await s.setRole(assignment);
          await auditOutbox(s, context, 'identity.role.changed', {
            memberId: assignment.memberId,
            role: assignment.role,
          });
        },
      );
    },
    async removeRole(context: OperationContext, id: string) {
      const target = await repo.transaction(context.actor.orgId, context.actor.actorId, (s) => s.role(id));
      if (!target) throw new IdentityDeniedError();
      context = { ...context, scope: target.scope, object: { type: 'member', id: target.memberId } };
      await requirePermission(context, target.role.startsWith('platform_') ? 'org.provision' : 'member.manage');
      await mutate(context, target.role.startsWith('platform_') ? 'org.provision' : 'member.manage', async (s) => {
        await s.removeRole(id);
        await auditOutbox(s, context, 'identity.role.removed', { roleAssignmentId: id });
      });
    },
    async saveRule(context: OperationContext, input: PermissionRule) {
      const rule = permissionRuleSchema.parse(input);
      context = { ...context, scope: rule.scope, object: { type: 'permission_rule', id: rule.id } };
      const manage = ['org.provision', 'integration.manage', 'telemetry.manage', 'platform.upgrade'].includes(
        rule.permission,
      )
        ? 'org.provision'
        : 'member.manage';
      await requirePermission(context, manage);
      if (rule.scope.orgId !== context.actor.orgId) throw new IdentityDeniedError();
      await mutate(context, manage, async (s, facts) => {
        const old = (await s.rules()).find((existing) => existing.id === rule.id);
        if (
          old &&
          ['org.provision', 'integration.manage', 'telemetry.manage', 'platform.upgrade'].includes(old.permission) &&
          manage !== 'org.provision'
        ) {
          const check = { ...context, permission: 'org.provision' };
          if (!(await decideInTransaction(s, check, facts)).allowed) throw new IdentityDeniedError();
        }
        if (old && (!scopeContains(old.scope, rule.scope) || !scopeContains(rule.scope, old.scope)))
          throw new IdentityDeniedError();
        await s.putRule({ ...rule, isCustomized: true });
        await auditOutbox(s, context, 'identity.rule.changed', { ruleId: rule.id });
        await s.enqueue({
          version: 1,
          eventId: newId('evt'),
          orgId: context.actor.orgId,
          topic: 'identity.rule.changed',
          payload: { ruleId: rule.id, policyVersion: rule.policyVersion },
          occurredAt: deps.clock().toISOString(),
        });
      });
    },
    async resolveExternal(
      context: OperationContext,
      input: { provider: string; issuer: string; subject: string; eventId: string },
    ) {
      await requirePermission(context);
      return repo.transaction(context.actor.orgId, context.actor.actorId, async (s) => {
        const accounts = await s.external(input.provider, input.issuer, input.subject);
        if (accounts.length !== 1) {
          await s.associationIssue(input);
          return { kind: 'unresolved' as const };
        }
        const member = await s.member(accounts[0]!.memberId);
        if (!member?.active) {
          await s.associationIssue(input);
          return { kind: 'unresolved' as const };
        }
        return { kind: 'resolved' as const, memberId: member.id };
      });
    },
    async associationIssues(context: OperationContext) {
      context = { ...context, scope: { orgId: context.actor.orgId } };
      await requirePermission(context, 'member.manage');
      return repo.transaction(context.actor.orgId, context.actor.actorId, (s) => s.issues());
    },
    async linkExternal(context: OperationContext, account: ExternalAccount, issueId?: string) {
      context = { ...context, scope: { orgId: context.actor.orgId }, object: { type: 'member', id: account.memberId } };
      await requirePermission(context, 'member.manage');
      await mutate(context, 'member.manage', async (s) => {
        if (!(await s.member(account.memberId))?.active) throw new IdentityDeniedError();
        await s.link(account);
        await auditOutbox(s, context, 'identity.external.linked', { memberId: account.memberId });
        if (issueId) {
          const issue = (await s.issues()).find((x) => x.id === issueId);
          if (
            !issue ||
            issue.provider !== account.provider ||
            issue.issuer !== account.issuer ||
            issue.subject !== account.subject
          )
            throw new IdentityDeniedError();
          await s.resolveIssue(issueId);
          await s.enqueue({
            version: 1,
            eventId: newId('evt'),
            orgId: context.actor.orgId,
            topic: 'identity.association.resolved',
            payload: { eventId: issue.eventId },
            occurredAt: deps.clock().toISOString(),
          });
        }
      });
    },
  };
  async function contextBoundary<T>(context: OperationContext, work: () => Promise<T>): Promise<T> {
    operationContextSchema.parse(context);
    try {
      return await work();
    } catch {
      // Persist a safe denial only after any owner transaction has rolled back.
      await record(context, 'identity.operation.denied', 'denied', { reason: 'authorization-or-operation-rejected' });
      throw new IdentityDeniedError();
    }
  }
  async function safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof IdentityDeniedError) throw error; // No credentials-bearing provider/database cause crosses this public boundary.
      // eslint-disable-next-line preserve-caught-error -- Original adapter errors may contain credentials.
      throw new Error('Identity operation unavailable');
    }
  }
  async function authenticationBoundary<T>(request: IdentityRequest, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      await record(
        contextFor({
          version: 1,
          actorId: 'unauthenticated',
          actorKind: 'service',
          orgId: request.orgId,
          clientId: request.clientId,
          source: request.source,
          traceId: request.traceId,
        }),
        'identity.authentication.denied',
        'denied',
        { reason: 'invalid-session-or-login' },
      );
      throw new IdentityDeniedError();
    }
  }
  return {
    authorize: (...args: Parameters<typeof service.authorize>) =>
      safe(() => contextBoundary(args[0], () => service.authorize(...args))),
    authenticateContext: (...args: Parameters<typeof service.authenticateContext>) =>
      safe(() => service.authenticateContext(...args)),
    beginLogin: (...args: Parameters<typeof service.beginLogin>) => safe(() => service.beginLogin(...args)),
    completeLogin: (...args: Parameters<typeof service.completeLogin>) =>
      safe(() => authenticationBoundary(args[0].request, () => service.completeLogin(...args))),
    authenticateSession: (...args: Parameters<typeof service.authenticateSession>) =>
      safe(() => authenticationBoundary(args[1], () => service.authenticateSession(...args))),
    logout: (...args: Parameters<typeof service.logout>) =>
      safe(() => contextBoundary(args[0], () => service.logout(...args))),
    resolveMembers: (...args: Parameters<typeof service.resolveMembers>) =>
      safe(() => contextBoundary(args[0], () => service.resolveMembers(...args))),
    effectivePermissions: (...args: Parameters<typeof service.effectivePermissions>) =>
      safe(() => contextBoundary(args[0], () => service.effectivePermissions(...args))),
    issueAuthorization: (...args: Parameters<typeof service.issueAuthorization>) =>
      safe(() => contextBoundary(args[0], () => service.issueAuthorization(...args))),
    revoke: (...args: Parameters<typeof service.revoke>) =>
      safe(() => contextBoundary(args[0], () => service.revoke(...args))),
    setMember: (...args: Parameters<typeof service.setMember>) =>
      safe(() => contextBoundary(args[0], () => service.setMember(...args))),
    assignRole: (...args: Parameters<typeof service.assignRole>) =>
      safe(() => contextBoundary(args[0], () => service.assignRole(...args))),
    removeRole: (...args: Parameters<typeof service.removeRole>) =>
      safe(() => contextBoundary(args[0], () => service.removeRole(...args))),
    saveRule: (...args: Parameters<typeof service.saveRule>) =>
      safe(() => contextBoundary(args[0], () => service.saveRule(...args))),
    resolveExternal: (...args: Parameters<typeof service.resolveExternal>) =>
      safe(() => contextBoundary(args[0], () => service.resolveExternal(...args))),
    associationIssues: (...args: Parameters<typeof service.associationIssues>) =>
      safe(() => contextBoundary(args[0], () => service.associationIssues(...args))),
    linkExternal: (...args: Parameters<typeof service.linkExternal>) =>
      safe(() => contextBoundary(args[0], () => service.linkExternal(...args))),
  };
}
