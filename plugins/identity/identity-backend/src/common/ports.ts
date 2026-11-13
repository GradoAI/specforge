import type { ActorContext, OperationContext, Scope } from '@fasrun/contracts-core';
import type {
  Authorization,
  Member,
  RoleAssignment,
  PermissionRule,
  AdmissionFacts,
} from '@fasrun/plugin-identity-common';
import type { OutboxEvent, OutboxPort } from '@fasrun/backend-plugin-api';
export interface SessionRecord {
  digest: string;
  memberId: string;
  sessionVersion: number;
  csrfDigest: string;
  expiresAt: string;
  revoked: boolean;
}
export interface LoginChallenge {
  stateDigest: string;
  browserDigest: string;
  verifier: string;
  nonce: string;
  expiresAt: string;
}
export interface ExternalAccount {
  provider: string;
  issuer: string;
  subject: string;
  memberId: string;
}
export interface AssociationIssue {
  id: string;
  provider: string;
  issuer: string;
  subject: string;
  eventId: string;
  state: 'pending' | 'resolved';
}
export interface IdentityTransaction {
  member(id: string): Promise<Member | undefined>;
  bySubject(issuer: string, subject: string): Promise<Member[]>;
  putMember(member: Member): Promise<void>;
  role(id: string): Promise<RoleAssignment | undefined>;
  roles(memberId: string): Promise<RoleAssignment[]>;
  setRole(role: RoleAssignment): Promise<void>;
  removeRole(id: string): Promise<void>;
  rules(): Promise<PermissionRule[]>;
  putRule(rule: PermissionRule): Promise<void>;
  projectScopes(memberId: string): Promise<Scope[]>;
  putProjectScope(memberId: string, scope: Scope): Promise<void>;
  external(provider: string, issuer: string, subject: string): Promise<ExternalAccount[]>;
  link(account: ExternalAccount): Promise<void>;
  associationIssue(input: Omit<AssociationIssue, 'id' | 'state'>): Promise<AssociationIssue>;
  issues(): Promise<AssociationIssue[]>;
  resolveIssue(id: string): Promise<void>;
  authorization(id: string): Promise<{ snapshot: Authorization; permissions: string[]; revoked: boolean } | undefined>;
  byIntake(intakeId: string): Promise<Authorization | undefined>;
  issue(snapshot: Authorization, permissions: string[]): Promise<Authorization>;
  revoke(id: string, reason: string, key: string): Promise<void>;
  session(digest: string): Promise<SessionRecord | undefined>;
  saveSession(session: SessionRecord): Promise<void>;
  revokeSession(digest: string): Promise<void>;
  saveChallenge(challenge: LoginChallenge): Promise<void>;
  takeChallenge(stateDigest: string, browserDigest: string, now: string): Promise<LoginChallenge | undefined>;
  candidate(intakeId: string, facts: AdmissionFacts): Promise<void>;
  enqueue(event: OutboxEvent): Promise<void>;
}
export interface IdentityRepository {
  transaction<T>(orgId: string, actorId: string, work: (session: IdentityTransaction) => Promise<T>): Promise<T>;
  outbox(orgId: string): OutboxPort;
}
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  expiresAt: number;
  nonce?: string;
}
export interface OidcProvider {
  verify(token: string, kind?: 'access' | 'id'): Promise<VerifiedIdentity>;
  authorizationUrl(input: { state: string; nonce: string; challenge: string }): string;
  exchange(code: string, verifier: string): Promise<{ identity: VerifiedIdentity }>;
}
export interface IdentityAudit {
  record(
    context: OperationContext,
    action: string,
    outcome: 'allowed' | 'denied',
    details?: Record<string, string>,
  ): Promise<void>;
}
export type TrustedActor = ActorContext;
